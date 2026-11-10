// Package flags is the Go client for Vercel Flags.
//
// A Client loads the flag definitions of a project environment from Vercel,
// keeps them current with a stream, and evaluates flags in memory. Its
// evaluator is a port of the evaluator of the Node.js client
// @vercel/flags-core and gives the same results. See the README for the usage.
package flags

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// Client evaluates feature flags of one Vercel project environment.
//
// A client keeps the flag definitions in memory, so an evaluation needs no
// request. It receives updates from a stream. When the stream fails, it polls.
// When no source is reachable, it continues with the last definitions.
//
// Create one client for the lifetime of the process and share it. A Client is
// safe for concurrent use.
type Client struct {
	cfg       config
	creds     *credentials
	transport *transport
	store     *store
	usage     *usageTracker // nil for an offline client.
	logger    *slog.Logger

	// ctx ends when Shutdown starts. It stops the sources and all waits.
	ctx    context.Context
	cancel context.CancelFunc
	// drainCtx ends when Shutdown returns. The work that Shutdown waits for
	// uses it: the last sends of usage events and the exposure handler.
	drainCtx    context.Context
	drainCancel context.CancelFunc
	wg          sync.WaitGroup

	startOnce    sync.Once
	shutdownOnce sync.Once
	closed       atomic.Bool
	// spawnMu makes sure that no goroutine starts after Shutdown waits.
	spawnMu sync.RWMutex

	// ready closes when the client can serve evaluations without a wait: a
	// source delivered data or gave up, or the init timeout ended.
	ready     chan struct{}
	readyOnce sync.Once

	// The state of the sources. Read it with State.
	mode      atomic.Int32
	connected atomic.Bool
	// stopped is true when the client has no source that connects again.
	stopped      atomic.Bool
	unauthorized atomic.Bool
	// sourceErr is the last error of a source. It explains ErrNoData.
	sourceErr atomic.Pointer[error]

	// fallback is the datafile from the embedded definitions.
	fallbackOnce sync.Once
	fallback     *Datafile
	fallbackErr  error

	// firstRead is true after the first read of the definitions.
	firstRead atomic.Bool

	// refresh shares one HTTP fetch between all callers.
	refreshMu   sync.Mutex
	refreshCall *refreshCall
	// refreshFailedAt stops a new fetch soon after a failed one.
	refreshFailedAt atomic.Int64

	exposures chan exposureReport
}

type refreshCall struct {
	done chan struct{}
	err  error
}

type exposureReport struct {
	exposures []Exposure
	entities  Entities
}

// Mode is the way in which a client receives flag definitions.
type Mode int32

const (
	// ModeOffline means no source is active.
	ModeOffline Mode = iota
	// ModeStreaming means the client receives updates from the stream.
	ModeStreaming
	// ModePolling means the client fetches the definitions at an interval.
	ModePolling
)

func (m Mode) String() string {
	switch m {
	case ModeStreaming:
		return "streaming"
	case ModePolling:
		return "polling"
	}
	return "offline"
}

// State describes how a client receives flag definitions at one moment.
type State struct {
	// Mode is the active source.
	Mode Mode
	// Connected tells whether the stream is connected. It is false in the
	// other modes.
	Connected bool
	// Revision is the revision of the current datafile. It is 0 when the
	// client has no datafile or the datafile has no revision.
	Revision int64
}

// NewClient creates a client.
//
// The sdkKey is an SDK key ("vf_server_...") or a connection string that
// contains one. When it is empty, the client reads the FLAGS environment
// variable. When that is also empty, the client uses a Vercel OIDC token: see
// WithTokenSource and WithProjectID. NewClient returns an error that wraps
// ErrUnauthorized when it finds no credentials.
//
// NewClient makes no request. The client connects on the first evaluation or
// on a call to Initialize. Call Shutdown to stop the client.
func NewClient(sdkKey string, opts ...Option) (*Client, error) {
	cfg := defaultConfig()
	for _, opt := range opts {
		opt(&cfg)
	}
	if err := cfg.err(); err != nil {
		return nil, err
	}
	if cfg.offline {
		cfg.stream, cfg.polling = false, false
	}

	creds, err := newCredentials(sdkKey, &cfg)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	drainCtx, drainCancel := context.WithCancel(context.Background())
	c := &Client{
		cfg:         cfg,
		creds:       creds,
		transport:   newTransport(&cfg, creds),
		store:       newStore(cfg.staleIfError),
		logger:      cfg.logger,
		ctx:         ctx,
		cancel:      cancel,
		drainCtx:    drainCtx,
		drainCancel: drainCancel,
		ready:       make(chan struct{}),
	}
	if cfg.datafile != nil {
		c.store.seed(cfg.datafile, originProvided)
	}
	if !cfg.offline {
		c.usage = newUsageTracker(c.transport, &cfg, drainCtx)
	}
	if cfg.exposureHandler != nil {
		c.exposures = make(chan exposureReport, 1024)
	}
	return c, nil
}

// Initialize connects the client and waits for the first flag definitions.
//
// It waits for the stream or the first poll until the init timeout ends.
// After that it uses the definitions from WithDatafile or
// WithEmbeddedDefinitions, or fetches the definitions one time. It returns an
// error only when the client has no definitions at all.
//
// A call to Initialize is optional: the first evaluation does the same. Call
// it at startup to find a configuration problem early.
func (c *Client) Initialize(ctx context.Context) error {
	if c.closed.Load() {
		return ErrClosed
	}
	c.startOnce.Do(c.start)

	select {
	case <-c.ready:
	case <-ctx.Done():
		return ctx.Err()
	case <-c.ctx.Done():
		return ErrClosed
	}

	if c.store.load().datafile != nil {
		return nil
	}
	if c.cfg.offline {
		return fmt.Errorf("%w: an offline client needs WithDatafile or WithEmbeddedDefinitions", ErrNoData)
	}
	// No source gave data in time. Fetch the definitions one time.
	if err := c.refresh(ctx, originFetched); err != nil {
		return c.noData()
	}
	return nil
}

// noData returns ErrNoData with the last error of a source as the cause.
func (c *Client) noData() error {
	if cause := c.sourceErr.Load(); cause != nil {
		return fmt.Errorf("%w: %w", ErrNoData, *cause)
	}
	return ErrNoData
}

// spawn runs fn in a goroutine that Shutdown waits for. It returns false and
// does not run fn when the client is closed.
func (c *Client) spawn(fn func()) bool {
	c.spawnMu.RLock()
	defer c.spawnMu.RUnlock()
	if c.closed.Load() {
		return false
	}
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		fn()
	}()
	return true
}

// start starts the sources of flag definitions. It runs one time.
func (c *Client) start() {
	// The embedded definitions are the start when there is no datafile. The
	// stream then sends their revision, and the server can confirm it with a
	// small message.
	if c.store.load().datafile == nil && len(c.cfg.embedded) > 0 {
		df, err := c.FallbackDatafile(c.ctx)
		if err == nil {
			c.store.seed(df, originEmbedded)
		} else {
			c.logger.Warn("flags: cannot use the embedded definitions", "error", err)
		}
	}

	if c.usage != nil {
		c.spawn(func() { c.usage.run(c.ctx) })
	}
	if c.exposures != nil {
		c.spawn(c.runExposures)
	}

	switch {
	case c.cfg.stream:
		c.mode.Store(int32(ModeStreaming))
		c.spawn(c.runStream)
	case c.cfg.polling:
		c.mode.Store(int32(ModePolling))
		c.spawn(c.runPolling)
	default:
		c.stopped.Store(true)
		c.markReady()
		return
	}

	// The client waits for its sources one time. After the timeout, each
	// evaluation uses the definitions that the client has.
	if c.cfg.initTimeout > 0 {
		time.AfterFunc(c.cfg.initTimeout, func() {
			c.readyOnce.Do(func() {
				if c.store.load().datafile != nil {
					c.logger.Warn("flags: the sources gave no data in time, using the existing definitions while the client connects in the background")
				}
				close(c.ready)
			})
		})
	}
}

func (c *Client) markReady() {
	c.readyOnce.Do(func() { close(c.ready) })
}

// sourceFailed records the error of a source.
func (c *Client) sourceFailed(err error) {
	c.sourceErr.Store(&err)
	// The flag is cleared when a source delivers data again.
	if errors.Is(err, ErrUnauthorized) {
		c.unauthorized.Store(true)
	}
	c.store.fail(time.Now())
}

// runStream follows the stream. When the stream gives up, it starts polling.
func (c *Client) runStream() {
	err := c.followStream()
	c.connected.Store(false)
	if err == nil {
		return
	}
	c.sourceFailed(err)

	// Polling uses the same credentials, so it would also be rejected.
	if c.cfg.polling && !errors.Is(err, ErrUnauthorized) {
		c.logger.Error("flags: the stream gave up, polling starts", "error", err)
		c.runPolling()
		return
	}
	c.logger.Error("flags: the stream gave up", "error", err)
	c.mode.Store(int32(ModeOffline))
	c.stopped.Store(true)
	c.markReady()
}

// runPolling fetches the datafile at each interval until the client closes
// or the credentials are rejected.
func (c *Client) runPolling() {
	c.mode.Store(int32(ModePolling))
	ticker := time.NewTicker(c.cfg.pollInterval)
	defer ticker.Stop()

	for {
		err := c.refresh(c.ctx, originPoll)
		c.markReady()
		if errors.Is(err, ErrUnauthorized) {
			c.logger.Error("flags: polling stopped, the credentials were rejected", "error", err)
			c.mode.Store(int32(ModeOffline))
			c.stopped.Store(true)
			return
		}
		if err != nil {
			c.logger.Debug("flags: poll failed", "error", err)
		}
		select {
		case <-c.ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// accept stores a datafile from a source.
func (c *Client) accept(df *Datafile, from origin) {
	now := time.Now()
	df.FetchedAt = now
	if c.store.update(df, now, from) {
		c.logger.Debug("flags: definitions updated", "revision", df.Revision)
	}
}

// startRefresh starts a fetch of the datafile over HTTP, or returns the fetch
// that is in progress. All callers share one request.
func (c *Client) startRefresh(from origin) *refreshCall {
	c.refreshMu.Lock()
	defer c.refreshMu.Unlock()
	if c.refreshCall != nil {
		return c.refreshCall
	}

	call := &refreshCall{done: make(chan struct{})}
	started := c.spawn(func() {
		df, err := c.transport.fetchDatafile(c.ctx)
		if err == nil {
			c.accept(df, from)
			c.unauthorized.Store(false)
			c.refreshFailedAt.Store(0)
		} else if c.ctx.Err() == nil {
			c.sourceFailed(err)
			c.refreshFailedAt.Store(time.Now().UnixNano())
		}
		call.err = err

		c.refreshMu.Lock()
		c.refreshCall = nil
		c.refreshMu.Unlock()
		close(call.done)
	})
	if !started {
		call.err = ErrClosed
		close(call.done)
		return call
	}
	c.refreshCall = call
	return call
}

// refresh fetches the datafile over HTTP and stores it. The request continues
// when the ctx of the caller is done.
func (c *Client) refresh(ctx context.Context, from origin) error {
	call := c.startRefresh(from)
	select {
	case <-call.done:
		return call.err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// read returns the definitions for an evaluation and the time of the read.
// The first read connects the client. It reports the read for the request in
// ctx.
func (c *Client) read(ctx context.Context) (*Datafile, Metrics, time.Time, error) {
	start := time.Now()
	if c.closed.Load() {
		return nil, Metrics{}, start, ErrClosed
	}
	hadData := c.store.load().datafile != nil

	select {
	case <-c.ready:
	default:
		// A failure is not final: the store decides below whether there are
		// definitions to serve.
		if err := c.Initialize(ctx); err != nil {
			c.logger.Debug("flags: initialization failed", "error", err)
		}
	}
	c.revalidate(ctx, start)

	snap, err := c.store.read(start)
	if errors.Is(err, ErrNoData) {
		err = c.noData()
	}
	if err != nil {
		return nil, Metrics{}, start, err
	}

	metrics := Metrics{
		Source:      snap.origin.source(),
		CacheStatus: CacheHit,
		Connected:   c.connected.Load(),
		Mode:        Mode(c.mode.Load()),
	}
	switch {
	case !hadData:
		// The read waited for the definitions.
		metrics.CacheStatus = CacheMiss
		now := time.Now()
		metrics.ReadDuration, start = now.Sub(start), now
	case !snap.failingSince.IsZero():
		metrics.CacheStatus = CacheStale
	}
	c.trackRead(ctx, snap.datafile, metrics, start)
	return snap.datafile, metrics, start, nil
}

// trackRead reports one read of the definitions for each request. A context
// with no request mark reports nothing: see NewRequestContext.
func (c *Client) trackRead(ctx context.Context, df *Datafile, metrics Metrics, now time.Time) {
	first := !c.firstRead.Load() && c.firstRead.CompareAndSwap(false, true)
	if c.usage == nil || c.unauthorized.Load() {
		return
	}
	scope := c.claimRead(ctx)
	if scope == nil {
		return
	}

	payload := readPayload{
		InvocationHost:   scope.host,
		VercelRequestID:  scope.vercelID,
		CacheStatus:      "HIT",
		CacheAction:      "NONE",
		CacheIsBlocking:  metrics.CacheStatus == CacheMiss,
		CacheIsFirstRead: first,
		Duration:         metrics.ReadDuration.Milliseconds(),
		ConfigUpdatedAt:  df.ConfigUpdatedAt,
		ConfigOrigin:     "in-memory",
		Mode:             "offline",
	}
	if metrics.CacheStatus == CacheMiss {
		payload.CacheStatus = "MISS"
	}
	if metrics.Source == SourceEmbedded {
		payload.ConfigOrigin = "embedded"
	}
	// A stream that is not connected is "offline", as in the Node.js client.
	switch {
	case metrics.Mode == ModeStreaming && metrics.Connected:
		payload.Mode, payload.CacheAction = "stream", "FOLLOWING"
	case metrics.Mode == ModePolling:
		payload.Mode, payload.CacheAction = "poll", "REFRESHING"
	}
	if df.hasRevision {
		payload.Revision = strconv.FormatInt(df.Revision, 10)
	}
	c.usage.trackRead(now.UnixMilli(), payload)
}

// revalidate refreshes the definitions over HTTP when no source keeps them
// current: the stream is disconnected, the sources gave up, or the client has
// no definitions.
func (c *Client) revalidate(ctx context.Context, now time.Time) {
	if c.cfg.offline {
		return
	}
	snap := c.store.load()
	hasData := snap.datafile != nil
	mode := Mode(c.mode.Load())
	disconnected := c.stopped.Load() || (mode == ModeStreaming && !c.connected.Load())
	if hasData && !disconnected {
		return
	}
	if !hasData && mode == ModePolling {
		// The poll loop fetches the definitions.
		return
	}
	if hasData && c.stopped.Load() && !c.cfg.stream && !c.cfg.polling {
		// Streaming and polling are disabled, so nothing refreshes.
		return
	}

	swr := c.cfg.staleWhileRevalidate
	// Do not start a new request soon after a failed one.
	if failedAt := c.refreshFailedAt.Load(); failedAt != 0 && now.Sub(time.Unix(0, failedAt)) < swr {
		return
	}

	age := now.Sub(snap.confirmedAt)
	known := !snap.confirmedAt.IsZero()
	switch {
	case !hasData:
		// Nothing to serve: wait for the fetch.
		_ = c.refresh(ctx, originFetched)
	case known && age <= swr:
		// Fresh.
	case known && c.cfg.staleIfError >= 0 && age > swr+c.cfg.staleIfError:
		// Expired: wait for the fetch.
		_ = c.refresh(ctx, originFetched)
	default:
		// Stale, or of unknown age: serve it and refresh in the background.
		c.startRefresh(originFetched)
	}
}

// Evaluate evaluates one flag and returns the detailed result.
//
// The error is not nil when the evaluation failed: the flag does not exist
// (ErrFlagNotFound), the client has no definitions (ErrNoData), or the
// definition is not valid. The Evaluation then has ReasonError.
func (c *Client) Evaluate(ctx context.Context, key string, entities Entities) (Evaluation, error) {
	df, metrics, start, err := c.read(ctx)
	if err != nil {
		c.trackFailure(start, err, key)
		return errorEvaluation(key, err)
	}
	evaluation, err := c.evaluate(df, metrics, start, key, entities, nil)
	if evaluation.Experiment != nil {
		c.reportExposures([]Exposure{{FlagKey: key, Experiment: *evaluation.Experiment}}, entities)
	}
	return evaluation, err
}

func (c *Client) evaluate(df *Datafile, metrics Metrics, start time.Time, key string, entities Entities, cache entityCache) (Evaluation, error) {
	evaluation, err := df.evaluate(key, entities, start, time.Local, cache)
	end := time.Now()
	metrics.EvaluationDuration = end.Sub(start)
	evaluation.Metrics = metrics
	if !c.unauthorized.Load() {
		c.usage.track(end.UnixMilli(), key, evaluation.VariantID, evaluation.Reason, df)
	}
	return evaluation, err
}

// trackFailure counts evaluations that failed because the client has no
// definitions.
func (c *Client) trackFailure(now time.Time, err error, keys ...string) {
	if errors.Is(err, ErrClosed) || c.unauthorized.Load() {
		return
	}
	for _, key := range keys {
		c.usage.track(now.UnixMilli(), key, "", ReasonError, nil)
	}
}

// EvaluateAll evaluates the flags with the given keys for the same entities
// against one version of the definitions. With no keys, it evaluates all
// flags.
//
// The error is not nil only when the client has no definitions. The failure
// of one flag is in the Err field of its Evaluation.
func (c *Client) EvaluateAll(ctx context.Context, keys []string, entities Entities) (map[string]Evaluation, error) {
	df, metrics, start, err := c.read(ctx)
	if err != nil {
		c.trackFailure(start, err, keys...)
		return nil, err
	}
	if len(keys) == 0 {
		keys = df.Keys()
	}

	results := make(map[string]Evaluation, len(keys))
	cache := entityCache{}
	var exposures []Exposure
	for _, key := range keys {
		evaluation, _ := c.evaluate(df, metrics, start, key, entities, cache)
		results[key] = evaluation
		if evaluation.Experiment != nil {
			exposures = append(exposures, Exposure{FlagKey: key, Experiment: *evaluation.Experiment})
		}
	}
	c.reportExposures(exposures, entities)
	return results, nil
}

func (c *Client) reportExposures(exposures []Exposure, entities Entities) {
	if c.exposures == nil || len(exposures) == 0 {
		return
	}
	select {
	case c.exposures <- exposureReport{exposures: exposures, entities: entities}:
	default:
		c.logger.Warn("flags: dropped experiment exposures, the exposure handler is too slow", "exposures", len(exposures))
	}
}

// runExposures calls the exposure handler for each report. After Shutdown
// starts, it handles the reports that are in the queue and returns.
func (c *Client) runExposures() {
	handle := func(report exposureReport) {
		defer func() {
			if r := recover(); r != nil {
				c.logger.Error("flags: exposure handler panicked", "panic", r)
			}
		}()
		c.cfg.exposureHandler(c.drainCtx, report.exposures, report.entities)
	}
	for {
		select {
		case report := <-c.exposures:
			handle(report)
		case <-c.ctx.Done():
			for {
				select {
				case report := <-c.exposures:
					handle(report)
				default:
					return
				}
			}
		}
	}
}

// Bool evaluates a boolean flag. It returns fallback and an error when the
// evaluation fails or the value is not a boolean.
func (c *Client) Bool(ctx context.Context, key string, fallback bool, entities Entities) (bool, error) {
	return typed(ctx, c, key, fallback, entities)
}

// String evaluates a string flag. It returns fallback and an error when the
// evaluation fails or the value is not a string.
func (c *Client) String(ctx context.Context, key string, fallback string, entities Entities) (string, error) {
	return typed(ctx, c, key, fallback, entities)
}

// Float evaluates a number flag. It returns fallback and an error when the
// evaluation fails or the value is not a number.
func (c *Client) Float(ctx context.Context, key string, fallback float64, entities Entities) (float64, error) {
	return typed(ctx, c, key, fallback, entities)
}

// Int evaluates a number flag with a whole number as value. It returns
// fallback and an error when the evaluation fails or the value is not a whole
// number.
func (c *Client) Int(ctx context.Context, key string, fallback int, entities Entities) (int, error) {
	value, err := typed(ctx, c, key, float64(fallback), entities)
	if err != nil {
		return fallback, err
	}
	if value != math.Trunc(value) || value < math.MinInt || value > math.MaxInt {
		return fallback, fmt.Errorf("%w: %q is %v, not a whole number", ErrTypeMismatch, key, value)
	}
	return int(value), nil
}

// Decode evaluates a flag with a JSON object or a list as value and stores
// the value in the value that target points to, with the rules of
// encoding/json. It does not change target when the evaluation fails.
func (c *Client) Decode(ctx context.Context, key string, target any, entities Entities) error {
	evaluation, err := c.Evaluate(ctx, key, entities)
	if err != nil {
		return err
	}
	return evaluation.Decode(target)
}

// typed evaluates a flag whose value must have the type of fallback.
func typed[T bool | string | float64](ctx context.Context, c *Client, key string, fallback T, entities Entities) (T, error) {
	evaluation, err := c.Evaluate(ctx, key, entities)
	if err != nil {
		return fallback, err
	}
	value, ok := evaluation.Value.(T)
	if !ok {
		return fallback, fmt.Errorf("%w: %q is %s, not %s", ErrTypeMismatch, key, describe(evaluation.Value), describe(fallback))
	}
	return value, nil
}

// Datafile returns the current flag definitions. It does not connect the
// client and does not count as a read. When the client has no definitions, it
// returns the embedded definitions, or fetches the definitions one time.
func (c *Client) Datafile(ctx context.Context) (*Datafile, error) {
	if c.closed.Load() {
		return nil, ErrClosed
	}
	if df := c.store.load().datafile; df != nil {
		return df, nil
	}
	if df, err := c.FallbackDatafile(ctx); err == nil {
		return df, nil
	}
	if c.cfg.offline {
		return nil, ErrNoData
	}
	if err := c.refresh(ctx, originFetched); err != nil {
		return nil, c.noData()
	}
	return c.store.load().datafile, nil
}

// State returns how the client receives flag definitions at this moment.
func (c *Client) State() State {
	state := State{Mode: Mode(c.mode.Load()), Connected: c.connected.Load()}
	if df := c.store.load().datafile; df != nil {
		state.Revision = df.Revision
	}
	return state
}

// Shutdown stops the client: it ends the stream or the polling, sends the
// usage events that are not sent yet, and waits for the exposure handler. It
// returns when this work is done, or with the error of ctx when ctx ends
// first. After Shutdown, evaluations return ErrClosed.
//
// Give Shutdown a context with a timeout, so that a service that does not
// answer cannot stop the exit of the program.
func (c *Client) Shutdown(ctx context.Context) error {
	c.shutdownOnce.Do(func() {
		c.spawnMu.Lock()
		c.closed.Store(true)
		c.spawnMu.Unlock()
		c.cancel()
	})

	// The work in progress ends when ctx ends.
	stop := context.AfterFunc(ctx, c.drainCancel)
	defer stop()

	done := make(chan struct{})
	go func() {
		c.wg.Wait()
		if !c.unauthorized.Load() {
			c.usage.flush(c.drainCtx, "shutdown")
		}
		c.drainCancel()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
