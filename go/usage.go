package flags

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// The client reports usage to POST /v1/ingest in batches, as the Node.js
// client does:
//
//   - FLAG_EVALUATION: how many times a flag gave a result in one minute.
//   - FLAGS_CONFIG_READ: one read of the definitions in a request.
//
// The cost for an evaluation is one lookup in a concurrent map and two atomic
// operations. Evaluations on many cores do not wait for each other.

const (
	// maxEventsPerRequest must stay below the limit of the ingest endpoint.
	maxEventsPerRequest = 2000
	// maxPendingReads limits the memory for read events while the ingest
	// endpoint is slow or not reachable. The tracker drops newer events.
	maxPendingReads   = 10 * maxEventsPerRequest
	maxIngestAttempts = 3
	ingestTimeout     = 10 * time.Second
	flushReasonHeader = "X-Vercel-Flags-Flush-Reason"
	minuteMs          = 60_000
	// lastEventStepMs is how exact the time of the last event is. A larger
	// step means fewer writes to memory that all cores share.
	lastEventStepMs = 50
)

type usageTiming struct {
	// idle is the time with no event after which a batch is sent. The tracker
	// changes it by ±jitter each time.
	idle   time.Duration
	jitter float64
	// maxWait is the longest time that a batch waits.
	maxWait time.Duration
	// retryBase and retryCap control the waits between attempts.
	retryBase time.Duration
	retryCap  time.Duration
}

var defaultUsageTiming = usageTiming{
	idle:      5 * time.Second,
	jitter:    0.2,
	maxWait:   time.Minute,
	retryBase: 250 * time.Millisecond,
	retryCap:  5 * time.Second,
}

// usageKey identifies the evaluations that one event counts.
type usageKey struct {
	flagKey     string
	variant     string
	reason      Reason
	revision    int64
	hasRevision bool
	// bucket is the start of the minute of the evaluations, as Unix epoch
	// milliseconds.
	bucket int64
}

type usageCounter struct {
	count atomic.Int64
	// firstMs is the time of the first evaluation since the last flush.
	firstMs atomic.Int64
}

type usageTracker struct {
	transport         *transport
	timing            usageTiming
	clientName        string
	metricEnvironment string
	evaluations       bool
	logger            *slog.Logger
	// sendCtx ends when the client gives up on the last sends at shutdown.
	sendCtx context.Context

	// The environment of the process, for read events.
	deploymentID, region, environment string

	counters  sync.Map // usageKey to *usageCounter
	pending   atomic.Bool
	lastEvent atomic.Int64 // Unix epoch milliseconds.

	mu           sync.Mutex
	reads        []ingestEvent
	droppedReads int

	// wake starts the flush loop for a new batch. full ends its wait when the
	// read events fill one request.
	wake chan struct{}
	full chan struct{}

	flushMu sync.Mutex // One flush at a time.
	flushes int
}

func newUsageTracker(t *transport, cfg *config, sendCtx context.Context) *usageTracker {
	return &usageTracker{
		transport:         t,
		timing:            cfg.usageTiming,
		clientName:        cfg.clientName,
		metricEnvironment: cfg.metricEnvironment,
		evaluations:       cfg.evaluationMetrics,
		logger:            cfg.logger,
		sendCtx:           sendCtx,
		deploymentID:      os.Getenv("VERCEL_DEPLOYMENT_ID"),
		region:            os.Getenv("VERCEL_REGION"),
		environment:       os.Getenv("VERCEL_ENV"),
		wake:              make(chan struct{}, 1),
		full:              make(chan struct{}, 1),
	}
}

// track counts one evaluation at the time nowMs. It does not block.
func (u *usageTracker) track(nowMs int64, flagKey, variant string, reason Reason, df *Datafile) {
	if u == nil || !u.evaluations {
		return
	}
	key := usageKey{flagKey: flagKey, variant: variant, reason: reason, bucket: nowMs - nowMs%minuteMs}
	if df != nil && df.hasRevision {
		key.revision, key.hasRevision = df.Revision, true
	}

	value, ok := u.counters.Load(key)
	if !ok {
		value, _ = u.counters.LoadOrStore(key, &usageCounter{})
	}
	counter := value.(*usageCounter)
	if counter.firstMs.Load() == 0 {
		counter.firstMs.CompareAndSwap(0, nowMs)
	}
	counter.count.Add(1)
	u.touch(nowMs)
}

// readPayload is the payload of a FLAGS_CONFIG_READ event.
type readPayload struct {
	DeploymentID     string `json:"deploymentId,omitempty"`
	Region           string `json:"region,omitempty"`
	InvocationHost   string `json:"invocationHost,omitempty"`
	VercelRequestID  string `json:"vercelRequestId,omitempty"`
	CacheStatus      string `json:"cacheStatus,omitempty"`
	CacheAction      string `json:"cacheAction,omitempty"`
	CacheIsBlocking  bool   `json:"cacheIsBlocking"`
	CacheIsFirstRead bool   `json:"cacheIsFirstRead,omitempty"`
	Duration         int64  `json:"duration"`
	ConfigUpdatedAt  int64  `json:"configUpdatedAt,omitempty"`
	ConfigOrigin     string `json:"configOrigin"`
	Mode             string `json:"mode"`
	Revision         string `json:"revision,omitempty"`
	Environment      string `json:"environment,omitempty"`
}

// trackRead records one read of the flag definitions. It does not block.
func (u *usageTracker) trackRead(nowMs int64, payload readPayload) {
	payload.DeploymentID, payload.Region, payload.Environment = u.deploymentID, u.region, u.environment

	u.mu.Lock()
	if len(u.reads) >= maxPendingReads {
		u.droppedReads++
		u.mu.Unlock()
		return
	}
	u.reads = append(u.reads, ingestEvent{Type: "FLAGS_CONFIG_READ", TS: nowMs, Payload: payload})
	full := len(u.reads)%maxEventsPerRequest == 0
	u.mu.Unlock()

	u.touch(nowMs)
	if full {
		select {
		case u.full <- struct{}{}:
		default:
		}
	}
}

// touch records the time of an event and starts a batch when there is none.
func (u *usageTracker) touch(nowMs int64) {
	if nowMs-u.lastEvent.Load() >= lastEventStepMs {
		u.lastEvent.Store(nowMs)
	}
	if !u.pending.Load() && u.pending.CompareAndSwap(false, true) {
		select {
		case u.wake <- struct{}{}:
		default:
		}
	}
}

// run sends each batch after the idle time or the maximum wait. It returns
// when stop is done. A send that is in progress then continues, and the
// caller sends the last batch with flush.
func (u *usageTracker) run(stop context.Context) {
	for {
		select {
		case <-stop.Done():
			return
		case <-u.wake:
		}

		batchStart := time.Now()
		idle := u.timing.idle
		if u.timing.jitter > 0 {
			idle = time.Duration(float64(idle) * (1 - u.timing.jitter + 2*u.timing.jitter*rand.Float64()))
		}
		reason := ""
		for reason == "" {
			idleAt := time.UnixMilli(u.lastEvent.Load()).Add(idle)
			maxAt := batchStart.Add(u.timing.maxWait)
			now := time.Now()
			switch {
			case !now.Before(maxAt):
				reason = "max_timeout"
			case !now.Before(idleAt):
				reason = "idle_timeout"
			default:
				timer := time.NewTimer(min(idleAt.Sub(now), maxAt.Sub(now)))
				select {
				case <-timer.C:
				case <-u.full:
					// The batch has its maximum size.
					reason = "max_timeout"
				case <-stop.Done():
					timer.Stop()
					return
				}
				timer.Stop()
			}
		}
		u.flush(u.sendCtx, reason)
	}
}

type ingestEvent struct {
	Type    string `json:"type"`
	TS      int64  `json:"ts"`
	Payload any    `json:"payload"`
}

// evaluationPayload is the payload of a FLAG_EVALUATION event.
type evaluationPayload struct {
	FlagKey         string `json:"flagKey"`
	Variant         string `json:"variant,omitempty"`
	Reason          Reason `json:"reason"`
	ClientName      string `json:"clientName,omitempty"`
	Revision        string `json:"revision,omitempty"`
	EvaluationCount int64  `json:"evaluationCount"`
	PeriodStartedAt int64  `json:"periodStartedAt"`
}

// collect removes all recorded events from the tracker and returns them.
func (u *usageTracker) collect() []ingestEvent {
	// Events that arrive from now on start the next batch.
	u.pending.Store(false)

	u.mu.Lock()
	events := u.reads
	dropped := u.droppedReads
	u.reads, u.droppedReads = nil, 0
	u.mu.Unlock()
	if dropped > 0 {
		u.logger.Warn("flags: dropped read events, the ingest endpoint is too slow", "events", dropped)
	}

	nowMs := time.Now().UnixMilli()
	u.counters.Range(func(k, v any) bool {
		key, counter := k.(usageKey), v.(*usageCounter)
		count := counter.count.Swap(0)
		firstMs := counter.firstMs.Swap(0)
		if count == 0 {
			// No evaluation can still count in a minute that is long over.
			if key.bucket < nowMs-2*minuteMs {
				u.counters.Delete(key)
			}
			return true
		}
		if firstMs == 0 {
			firstMs = nowMs
		}
		payload := evaluationPayload{
			FlagKey:         key.flagKey,
			Variant:         key.variant,
			Reason:          key.reason,
			ClientName:      u.clientName,
			EvaluationCount: count,
			PeriodStartedAt: key.bucket,
		}
		if key.hasRevision {
			payload.Revision = strconv.FormatInt(key.revision, 10)
		}
		events = append(events, ingestEvent{Type: "FLAG_EVALUATION", TS: firstMs, Payload: payload})
		return true
	})
	return events
}

// flush sends all recorded events. It stops at the first request that fails
// all attempts: the remaining events of the batch are dropped, so a slow
// ingest endpoint cannot hold many batches in memory.
func (u *usageTracker) flush(ctx context.Context, reason string) {
	if u == nil {
		return
	}
	u.flushMu.Lock()
	defer u.flushMu.Unlock()

	events := u.collect()
	if len(events) == 0 {
		return
	}
	u.flushes++

	for sent := 0; sent < len(events); {
		chunk := events[sent:min(sent+maxEventsPerRequest, len(events))]
		if err := u.send(ctx, chunk, reason); err != nil {
			u.logger.Warn("flags: dropped usage events", "events", len(events)-sent, "flush", u.flushes, "error", err)
			return
		}
		sent += len(chunk)
	}
}

func (u *usageTracker) send(ctx context.Context, events []ingestEvent, reason string) error {
	body, err := json.Marshal(events)
	if err != nil {
		return err
	}
	for attempt := 1; ; attempt++ {
		err = u.post(ctx, body, reason)
		if err == nil || attempt == maxIngestAttempts {
			return err
		}
		u.logger.Debug("flags: failed to send usage events", "attempt", attempt, "error", err)
		// Exponential backoff with full jitter.
		ceiling := min(u.timing.retryCap, u.timing.retryBase<<(attempt-1))
		if ceiling > 0 && sleep(ctx, rand.N(ceiling)) != nil {
			return err
		}
	}
}

func (u *usageTracker) post(ctx context.Context, body []byte, reason string) error {
	ctx, cancel := context.WithTimeout(ctx, ingestTimeout)
	defer cancel()

	req, err := u.transport.newRequest(ctx, http.MethodPost, "/v1/ingest", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(flushReasonHeader, reason)
	if u.metricEnvironment != "" {
		req.Header.Set("X-Vercel-Env", u.metricEnvironment)
	}
	// With an SDK key, the OIDC token tells which project evaluates the flags.
	if creds := u.transport.creds; creds.sdkKey != "" {
		if token, err := creds.oidc(ctx); err == nil && token != "" {
			req.Header.Set(evaluatingTokenHeader, token)
		}
	}

	res, err := u.transport.http.Do(req)
	if err != nil {
		return err
	}
	defer drain(res.Body)
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("ingest endpoint responded with status %d (request %s)", res.StatusCode, res.Header.Get("x-vercel-id"))
	}
	return nil
}

// drain reads the rest of a response body and closes it, so that the
// connection can be used again.
func drain(body io.ReadCloser) {
	_, _ = io.Copy(io.Discard, io.LimitReader(body, 64<<10))
	_ = body.Close()
}
