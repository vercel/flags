package flags

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vercel/flags/go/internal/embedded"
)

const testSDKKey = "vf_server_test"

// testDatafile returns a datafile with the boolean flag "feature" and the
// string flag "color".
func testDatafile(revision int, enabled bool) string {
	variant := 0
	if enabled {
		variant = 1
	}
	return fmt.Sprintf(`{
		"projectId": "prj_test",
		"environment": "production",
		"configUpdatedAt": %d,
		"revision": %d,
		"definitions": {
			"feature": {"variants": [false, true], "variantIds": ["off", "on"], "environments": {"production": %d}},
			"color": {"variants": ["red", "blue"], "environments": {"production": {
				"rules": [{"conditions": [[["user", "plan"], "eq", "pro"]], "outcome": 1}],
				"fallthrough": 0
			}}},
			"limit": {"variants": [10, 2.5, {"max": 3, "tags": ["a"]}], "environments": {"production": 0, "preview": 1}}
		}
	}`, revision, revision, variant)
}

func mustParse(t *testing.T, data string) *Datafile {
	t.Helper()
	df, err := ParseDatafile([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	return df
}

// fakeService is a test double of the Vercel Flags service.
type fakeService struct {
	t      *testing.T
	server *httptest.Server

	mu sync.Mutex
	// datafile handles GET /v1/datafile. The argument is the request number,
	// from 1.
	datafile func(n int) (status int, body string)
	// stream handles GET /v1/stream. It returns when the connection must end.
	stream func(n int, r *http.Request, send func(line string))

	// ingestStatus returns the status of POST /v1/ingest. It can be nil.
	ingestStatus func() int

	datafileRequests atomic.Int32
	streamRequests   atomic.Int32
	streamHeaders    []http.Header
	ingest           [][]testEvent
	ingestHeaders    []http.Header
}

// testEvent is an ingest event as the service receives it.
type testEvent struct {
	Type    string          `json:"type"`
	TS      int64           `json:"ts"`
	Payload json.RawMessage `json:"payload"`
}

func newFakeService(t *testing.T) *fakeService {
	s := &fakeService{t: t}
	s.datafile = func(int) (int, string) { return http.StatusServiceUnavailable, "" }
	s.stream = func(int, *http.Request, func(string)) {}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/datafile", func(w http.ResponseWriter, r *http.Request) {
		n := int(s.datafileRequests.Add(1))
		s.mu.Lock()
		handler := s.datafile
		s.mu.Unlock()
		status, body := handler(n)
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	})
	mux.HandleFunc("GET /v1/stream", func(w http.ResponseWriter, r *http.Request) {
		n := int(s.streamRequests.Add(1))
		s.mu.Lock()
		s.streamHeaders = append(s.streamHeaders, r.Header.Clone())
		handler := s.stream
		s.mu.Unlock()
		handler(n, r, func(line string) {
			if line == "401" || line == "500" {
				status := http.StatusUnauthorized
				if line == "500" {
					status = http.StatusInternalServerError
				}
				w.WriteHeader(status)
				return
			}
			_, _ = io.WriteString(w, line+"\n")
			w.(http.Flusher).Flush()
		})
	})
	mux.HandleFunc("POST /v1/ingest", func(w http.ResponseWriter, r *http.Request) {
		var events []testEvent
		if err := json.NewDecoder(r.Body).Decode(&events); err != nil {
			t.Errorf("ingest body: %v", err)
		}
		if s.ingestStatus != nil {
			if status := s.ingestStatus(); status != http.StatusOK {
				w.WriteHeader(status)
				return
			}
		}
		s.mu.Lock()
		s.ingest = append(s.ingest, events)
		s.ingestHeaders = append(s.ingestHeaders, r.Header.Clone())
		s.mu.Unlock()
	})

	s.server = httptest.NewServer(mux)
	t.Cleanup(s.server.Close)
	return s
}

func datafileMessage(datafile string) string {
	var compact json.RawMessage = []byte(datafile)
	line, _ := json.Marshal(map[string]any{"type": "datafile", "data": compact})
	return string(line)
}

// fastTiming makes the retries of a test client short.
func fastTiming(c *config) {
	c.streamTiming = streamTiming{maxRetries: 2, baseDelay: time.Millisecond, maxDelay: 5 * time.Millisecond, pingTimeout: time.Minute}
	c.usageTiming.retryBase = time.Millisecond
	c.pollInterval = 20 * time.Millisecond
}

func (s *fakeService) client(opts ...Option) *Client {
	s.t.Helper()
	all := append([]Option{
		WithBaseURL(s.server.URL),
		WithLogger(slog.New(slog.DiscardHandler)),
		WithInitTimeout(2 * time.Second),
		fastTiming,
	}, opts...)
	client, err := NewClient(testSDKKey, all...)
	if err != nil {
		s.t.Fatal(err)
	}
	s.t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := client.Shutdown(ctx); err != nil {
			s.t.Errorf("Shutdown: %v", err)
		}
	})
	return client
}

func eventually(t *testing.T, what string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !condition() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out: %s", what)
		}
		time.Sleep(2 * time.Millisecond)
	}
}

func TestClientStreamsUpdates(t *testing.T) {
	service := newFakeService(t)
	updates := make(chan string)
	service.stream = func(n int, r *http.Request, send func(string)) {
		send(datafileMessage(testDatafile(1, true)))
		for {
			select {
			case line := <-updates:
				send(line)
			case <-r.Context().Done():
				return
			}
		}
	}
	client := service.client()
	ctx := context.Background()

	enabled, err := client.Bool(ctx, "feature", false, nil)
	if err != nil || !enabled {
		t.Fatalf("Bool = %v, %v, want true", enabled, err)
	}
	if state := client.State(); state.Mode != ModeStreaming || !state.Connected || state.Revision != 1 {
		t.Errorf("State = %+v", state)
	}

	updates <- `{"type":"ping"}`
	updates <- "not json"
	// An older datafile does not replace a newer one.
	updates <- datafileMessage(testDatafile(0, false))
	updates <- datafileMessage(testDatafile(2, false))
	eventually(t, "the update arrives", func() bool {
		enabled, _ := client.Bool(ctx, "feature", true, nil)
		return !enabled
	})
	if revision := client.State().Revision; revision != 2 {
		t.Errorf("revision = %d, want 2", revision)
	}

	header := service.streamHeaders[0]
	if got := header.Get("Authorization"); got != "Bearer "+testSDKKey {
		t.Errorf("Authorization = %q", got)
	}
	if got := header.Get("X-Retry-Attempt"); got != "0" {
		t.Errorf("X-Retry-Attempt = %q", got)
	}
	if got := header.Get("User-Agent"); got != "VercelFlagsGo/"+Version {
		t.Errorf("User-Agent = %q", got)
	}
	if got := header.Get("X-Revision"); got != "" {
		t.Errorf("X-Revision = %q, want none", got)
	}
	if n := service.datafileRequests.Load(); n != 0 {
		t.Errorf("%d datafile requests, want 0", n)
	}
}

func TestClientPrimedKeepsProvidedDatafile(t *testing.T) {
	service := newFakeService(t)
	service.stream = func(n int, r *http.Request, send func(string)) {
		send(`{"type":"primed","revision":7,"projectId":"prj_test","environment":"production"}`)
		<-r.Context().Done()
	}
	client := service.client(WithDatafile(mustParse(t, testDatafile(7, true))))

	if err := client.Initialize(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := service.streamHeaders[0].Get("X-Revision"); got != "7" {
		t.Errorf("X-Revision = %q, want 7", got)
	}
	if enabled, err := client.Bool(context.Background(), "feature", false, nil); err != nil || !enabled {
		t.Errorf("Bool = %v, %v", enabled, err)
	}
	if client.store.load().confirmedAt.IsZero() {
		t.Error("primed did not confirm the datafile")
	}
}

func TestClientUnauthorized(t *testing.T) {
	service := newFakeService(t)
	service.stream = func(n int, r *http.Request, send func(string)) { send("401") }
	service.datafile = func(int) (int, string) { return http.StatusUnauthorized, "" }

	t.Run("no data", func(t *testing.T) {
		client := service.client()
		start := time.Now()
		err := client.Initialize(context.Background())
		if !errors.Is(err, ErrUnauthorized) || !errors.Is(err, ErrNoData) {
			t.Fatalf("Initialize = %v, want ErrNoData and ErrUnauthorized", err)
		}
		if time.Since(start) > time.Second {
			t.Error("Initialize waited for the timeout")
		}
		value, err := client.Bool(context.Background(), "feature", true, nil)
		if !value || !errors.Is(err, ErrNoData) || !errors.Is(err, ErrUnauthorized) {
			t.Errorf("Bool = %v, %v, want fallback, ErrNoData and ErrUnauthorized", value, err)
		}
	})

	t.Run("with datafile", func(t *testing.T) {
		before := service.streamRequests.Load()
		client := service.client(WithDatafile(mustParse(t, testDatafile(1, true))))
		if enabled, err := client.Bool(context.Background(), "feature", false, nil); err != nil || !enabled {
			t.Errorf("Bool = %v, %v", enabled, err)
		}
		time.Sleep(30 * time.Millisecond)
		if n := service.streamRequests.Load() - before; n != 1 {
			t.Errorf("%d stream requests, want 1: a rejected key must not retry", n)
		}
		if mode := client.State().Mode; mode != ModeOffline {
			t.Errorf("mode = %v, want offline: polling uses the same credentials", mode)
		}
	})

	if len(service.ingest) != 0 {
		t.Error("an unauthorized client sent usage events")
	}
}

func TestClientRecoversAfterUnauthorized(t *testing.T) {
	service := newFakeService(t)
	service.stream = func(n int, r *http.Request, send func(string)) { send("401") }
	var valid atomic.Bool
	service.datafile = func(int) (int, string) {
		if valid.Load() {
			return http.StatusOK, testDatafile(2, false)
		}
		return http.StatusUnauthorized, ""
	}
	client := service.client(
		WithDatafile(mustParse(t, testDatafile(1, true))),
		WithStaleWhileRevalidate(time.Millisecond),
	)
	ctx := context.Background()
	if enabled, err := client.Bool(ctx, "feature", false, nil); err != nil || !enabled {
		t.Fatalf("Bool = %v, %v", enabled, err)
	}

	// The token becomes valid again. Evaluations refresh over HTTP.
	valid.Store(true)
	eventually(t, "the client recovers", func() bool {
		enabled, err := client.Bool(ctx, "feature", true, nil)
		return err == nil && !enabled
	})
	if client.unauthorized.Load() {
		t.Error("the client is still unauthorized after a successful fetch")
	}
}

func TestClientWaitsForSourcesOnlyOnce(t *testing.T) {
	for name, stream := range map[string]func(int, *http.Request, func(string)){
		"stream fails":  func(n int, r *http.Request, send func(string)) { send("500") },
		"stream silent": func(n int, r *http.Request, send func(string)) { <-r.Context().Done() },
	} {
		t.Run(name, func(t *testing.T) {
			service := newFakeService(t)
			service.stream = stream
			client := service.client(
				WithDatafile(mustParse(t, testDatafile(1, true))),
				WithInitTimeout(100*time.Millisecond),
				func(c *config) { c.streamTiming.maxRetries = 1000 },
			)
			ctx := context.Background()

			start := time.Now()
			if enabled, err := client.Bool(ctx, "feature", false, nil); err != nil || !enabled {
				t.Fatalf("Bool = %v, %v", enabled, err)
			}
			if first := time.Since(start); first < 90*time.Millisecond {
				t.Errorf("the first evaluation took %v, want the init timeout", first)
			}
			start = time.Now()
			for range 20 {
				_, _ = client.Bool(ctx, "feature", false, nil)
			}
			if later := time.Since(start); later > 50*time.Millisecond {
				t.Errorf("20 later evaluations took %v, want no wait", later)
			}
		})
	}
}

func TestClientReturnsOwnedValues(t *testing.T) {
	df := mustParse(t, `{"projectId":"p","environment":"production","definitions":{"flag":{
		"variants": [{"max": 3, "tags": ["a"]}], "variantIds": ["v0"],
		"experiment": {"id": "exp_1", "base": ["user", "id"], "weights": [1], "defaultVariant": 0, "enrollmentSeed": 1},
		"environments": {"production": 0}}}}`)
	user := Entities{"user": map[string]any{"id": "u1"}}

	first, err := df.Evaluate("flag", user, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	first.Value.(map[string]any)["max"] = 999.0
	first.Value.(map[string]any)["tags"].([]any)[0] = "changed"
	first.Experiment.Base[0] = "team"

	second, _ := df.Evaluate("flag", user, time.Now())
	if got := fmt.Sprint(second.Value, second.Experiment.Base); got != "map[max:3 tags:[a]] [user id]" {
		t.Errorf("a caller changed the shared definitions: %s", got)
	}
}

func TestOptionsAreValidated(t *testing.T) {
	invalid := map[string]Option{
		"poll interval":          WithPollInterval(time.Second),
		"init timeout":           WithInitTimeout(-time.Second),
		"stale if error":         WithStaleIfError(-time.Second),
		"stale while revalidate": WithStaleWhileRevalidate(-time.Second),
	}
	for name, option := range invalid {
		if _, err := NewClient(testSDKKey, option); err == nil {
			t.Errorf("NewClient accepted an invalid %s", name)
		}
	}

	t.Setenv("FLAGS", "")
	t.Setenv(oidcTokenEnv, "")
	if _, err := NewClient(""); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("NewClient with no credentials = %v, want ErrUnauthorized", err)
	}
	// An offline client needs no credentials and sends nothing.
	client, err := NewClient("", WithOffline())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Bool(context.Background(), "feature", true, nil); !errors.Is(err, ErrNoData) {
		t.Errorf("Bool on an offline client with no definitions = %v, want ErrNoData", err)
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Error(err)
	}
}

func TestShutdownSendsTheBatchInFlight(t *testing.T) {
	service := newFakeService(t)
	var attempts atomic.Int32
	service.ingestStatus = func() int {
		if attempts.Add(1) == 1 {
			return http.StatusServiceUnavailable
		}
		return http.StatusOK
	}
	client, err := NewClient(testSDKKey,
		WithBaseURL(service.server.URL), WithLogger(nil),
		WithDatafile(mustParse(t, testDatafile(1, true))),
		WithoutStreaming(), WithoutPolling(),
		func(c *config) {
			c.usageTiming = usageTiming{idle: time.Millisecond, maxWait: time.Minute, retryBase: 400 * time.Millisecond, retryCap: 400 * time.Millisecond}
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = client.Bool(context.Background(), "feature", false, nil)
	// The idle flush fails one time and waits for its retry.
	eventually(t, "the first attempt", func() bool { return attempts.Load() == 1 })

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if len(service.ingest) != 1 || len(service.ingest[0]) != 1 {
		t.Errorf("ingest received %v, want the one event of the batch in flight", service.ingest)
	}
}

func TestShutdownDoesNotWaitForASilentIngest(t *testing.T) {
	block := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-block }))
	defer server.Close()
	defer close(block)

	client, err := NewClient(testSDKKey, WithBaseURL(server.URL), WithLogger(nil),
		WithDatafile(mustParse(t, testDatafile(1, true))), WithoutStreaming(), WithoutPolling())
	if err != nil {
		t.Fatal(err)
	}
	_, _ = client.Bool(context.Background(), "feature", false, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	if err := client.Shutdown(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("Shutdown = %v, want the deadline error", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Error("Shutdown waited for the ingest endpoint")
	}
}

func TestClientFetchesWhenStreamIsSlow(t *testing.T) {
	service := newFakeService(t)
	service.stream = func(n int, r *http.Request, send func(string)) { <-r.Context().Done() }
	service.datafile = func(int) (int, string) { return http.StatusOK, testDatafile(3, true) }
	client := service.client(WithInitTimeout(20 * time.Millisecond))

	enabled, err := client.Bool(context.Background(), "feature", false, nil)
	if err != nil || !enabled {
		t.Fatalf("Bool = %v, %v", enabled, err)
	}
	if state := client.State(); state.Mode != ModeStreaming || state.Connected {
		t.Errorf("State = %+v", state)
	}
}

func TestClientPollsWhenStreamGivesUp(t *testing.T) {
	service := newFakeService(t)
	service.stream = func(n int, r *http.Request, send func(string)) { send("500") }
	var revision atomic.Int32
	revision.Store(1)
	service.datafile = func(int) (int, string) {
		r := int(revision.Load())
		return http.StatusOK, testDatafile(r, r == 1)
	}
	client := service.client()
	ctx := context.Background()

	if enabled, err := client.Bool(ctx, "feature", false, nil); err != nil || !enabled {
		t.Fatalf("Bool = %v, %v", enabled, err)
	}
	eventually(t, "polling starts", func() bool { return client.State().Mode == ModePolling })
	if n := service.streamRequests.Load(); n != 3 {
		t.Errorf("%d stream requests, want 3 (one and two retries)", n)
	}
	if got := service.streamHeaders[2].Get("X-Retry-Attempt"); got != "2" {
		t.Errorf("X-Retry-Attempt = %q, want 2", got)
	}

	revision.Store(2)
	eventually(t, "the next poll arrives", func() bool {
		enabled, _ := client.Bool(ctx, "feature", true, nil)
		return !enabled
	})
}

func TestClientPollingRetries(t *testing.T) {
	service := newFakeService(t)
	service.datafile = func(n int) (int, string) {
		if n < 3 {
			return http.StatusServiceUnavailable, ""
		}
		return http.StatusOK, testDatafile(1, true)
	}
	client := service.client(WithoutStreaming())

	if err := client.Initialize(context.Background()); err != nil {
		t.Fatal(err)
	}
	if n := service.datafileRequests.Load(); n != 3 {
		t.Errorf("%d datafile requests, want 3", n)
	}
	if n := service.streamRequests.Load(); n != 0 {
		t.Errorf("%d stream requests, want 0", n)
	}
	if mode := client.State().Mode; mode != ModePolling {
		t.Errorf("mode = %v", mode)
	}
}

func TestClientDoesNotRetryClientErrors(t *testing.T) {
	service := newFakeService(t)
	service.datafile = func(int) (int, string) { return http.StatusNotFound, "" }
	client := service.client(WithoutStreaming(), WithoutPolling())

	value, err := client.String(context.Background(), "color", "fallback", nil)
	if value != "fallback" || !errors.Is(err, ErrNoData) {
		t.Fatalf("String = %q, %v", value, err)
	}
	// The next evaluation does not fetch again at once.
	_, _ = client.String(context.Background(), "color", "fallback", nil)
	if n := service.datafileRequests.Load(); n != 1 {
		t.Errorf("%d datafile requests, want 1", n)
	}
}

func TestClientOffline(t *testing.T) {
	service := newFakeService(t)
	client := service.client(
		WithDatafile(mustParse(t, testDatafile(1, true))),
		WithOffline(),
	)
	ctx := context.Background()
	pro := Entities{"user": map[string]any{"plan": "pro"}}

	if color, err := client.String(ctx, "color", "none", pro); err != nil || color != "blue" {
		t.Errorf("String = %q, %v", color, err)
	}
	if color, err := client.String(ctx, "color", "none", nil); err != nil || color != "red" {
		t.Errorf("String = %q, %v", color, err)
	}
	if limit, err := client.Int(ctx, "limit", -1, nil); err != nil || limit != 10 {
		t.Errorf("Int = %d, %v", limit, err)
	}
	if limit, err := client.Float(ctx, "limit", -1, nil); err != nil || limit != 10 {
		t.Errorf("Float = %v, %v", limit, err)
	}
	if value, err := client.Bool(ctx, "color", true, nil); !value || !errors.Is(err, ErrTypeMismatch) {
		t.Errorf("Bool on a string flag = %v, %v", value, err)
	}
	if value, err := client.Bool(ctx, "missing", true, nil); !value || !errors.Is(err, ErrFlagNotFound) {
		t.Errorf("Bool on a missing flag = %v, %v", value, err)
	}

	evaluation, err := client.Evaluate(ctx, "feature", nil)
	if err != nil {
		t.Fatal(err)
	}
	want := Evaluation{Key: "feature", Value: true, VariantID: "on", Reason: ReasonPaused, OutcomeType: OutcomeValue}
	if metrics := evaluation.Metrics; metrics.Source != SourceInMemory || metrics.CacheStatus != CacheHit || metrics.Mode != ModeOffline {
		t.Errorf("Metrics = %+v", metrics)
	}
	evaluation.Metrics = Metrics{}
	if fmt.Sprint(evaluation) != fmt.Sprint(want) {
		t.Errorf("Evaluate = %+v, want %+v", evaluation, want)
	}

	all, err := client.EvaluateAll(ctx, nil, pro)
	if err != nil || len(all) != 3 || all["color"].Value != "blue" || all["feature"].Value != true {
		t.Errorf("EvaluateAll = %+v, %v", all, err)
	}
	some, err := client.EvaluateAll(ctx, []string{"color", "missing"}, nil)
	if err != nil || len(some) != 2 || !errors.Is(some["missing"].Err, ErrFlagNotFound) {
		t.Errorf("EvaluateAll with keys = %+v, %v", some, err)
	}

	if n := service.streamRequests.Load() + service.datafileRequests.Load(); n != 0 {
		t.Errorf("%d requests, want 0", n)
	}
	if mode := client.State().Mode; mode != ModeOffline {
		t.Errorf("mode = %v", mode)
	}
}

func TestClientDecode(t *testing.T) {
	df := mustParse(t, `{"projectId":"p","environment":"production","definitions":{
		"config": {"variants": [{"max": 3, "tags": ["a", "b"]}], "environments": {"production": 0}}}}`)
	client, err := NewClient(testSDKKey, WithDatafile(df), WithOffline())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Shutdown(context.Background())

	var config struct {
		Max  int      `json:"max"`
		Tags []string `json:"tags"`
	}
	if err := client.Decode(context.Background(), "config", &config, nil); err != nil {
		t.Fatal(err)
	}
	if config.Max != 3 || len(config.Tags) != 2 {
		t.Errorf("config = %+v", config)
	}
	var wrong []int
	if err := client.Decode(context.Background(), "config", &wrong, nil); !errors.Is(err, ErrTypeMismatch) {
		t.Errorf("Decode into the wrong type = %v", err)
	}
}

func TestClientReportsUsage(t *testing.T) {
	service := newFakeService(t)
	client, err := NewClient(testSDKKey,
		WithBaseURL(service.server.URL),
		WithDatafile(mustParse(t, testDatafile(4, true))),
		WithoutStreaming(),
		WithoutPolling(),
		WithClientName("checkout"),
		WithMetricEnvironment("preview"),
	)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for range 3 {
		_, _ = client.Bool(ctx, "feature", false, nil)
	}
	_, _ = client.Bool(ctx, "missing", false, nil)
	if err := client.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Bool(ctx, "feature", false, nil); !errors.Is(err, ErrClosed) {
		t.Errorf("Bool after Shutdown = %v, want ErrClosed", err)
	}

	if len(service.ingest) != 1 {
		t.Fatalf("%d ingest requests, want 1", len(service.ingest))
	}
	header := service.ingestHeaders[0]
	if got := header.Get(flushReasonHeader); got != "shutdown" {
		t.Errorf("flush reason = %q", got)
	}
	if got := header.Get("X-Vercel-Env"); got != "preview" {
		t.Errorf("X-Vercel-Env = %q", got)
	}

	byKey := map[string]evaluationPayload{}
	for _, event := range service.ingest[0] {
		if event.Type != "FLAG_EVALUATION" || event.TS == 0 {
			t.Errorf("event = %+v", event)
		}
		var payload evaluationPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			t.Fatal(err)
		}
		byKey[payload.FlagKey] = payload
	}
	feature := byKey["feature"]
	if feature.EvaluationCount != 3 || feature.Variant != "on" || feature.Reason != ReasonPaused ||
		feature.Revision != "4" || feature.ClientName != "checkout" || feature.PeriodStartedAt%60_000 != 0 {
		t.Errorf("feature payload = %+v", feature)
	}
	missing := byKey["missing"]
	if missing.EvaluationCount != 1 || missing.Variant != "" || missing.Reason != ReasonError {
		t.Errorf("missing payload = %+v", missing)
	}
}

func TestClientFlushesUsageWhenIdle(t *testing.T) {
	service := newFakeService(t)
	client := service.client(
		WithDatafile(mustParse(t, testDatafile(1, true))),
		WithoutStreaming(),
		WithoutPolling(),
		func(c *config) { c.usageTiming.idle, c.usageTiming.jitter = 10*time.Millisecond, 0 },
	)
	_, _ = client.Bool(context.Background(), "feature", false, nil)

	eventually(t, "the idle flush", func() bool {
		service.mu.Lock()
		defer service.mu.Unlock()
		return len(service.ingest) == 1
	})
	service.mu.Lock()
	defer service.mu.Unlock()
	if got := service.ingestHeaders[0].Get(flushReasonHeader); got != "idle_timeout" {
		t.Errorf("flush reason = %q", got)
	}
}

func TestClientStaleIfError(t *testing.T) {
	// Zero means that the first failure stops the evaluations.
	for _, limit := range []time.Duration{0, 30 * time.Millisecond} {
		t.Run(limit.String(), func(t *testing.T) {
			service := newFakeService(t)
			service.stream = func(n int, r *http.Request, send func(string)) {
				if n == 1 {
					send(datafileMessage(testDatafile(1, true)))
					return
				}
				send("500")
			}
			client := service.client(
				WithStaleIfError(limit),
				WithoutPolling(),
				func(c *config) { c.streamTiming.maxRetries = 1000 },
			)
			ctx := context.Background()

			if limit > 0 {
				if enabled, err := client.Bool(ctx, "feature", false, nil); err != nil || !enabled {
					t.Fatalf("Bool = %v, %v", enabled, err)
				}
			}
			eventually(t, "the definitions become stale", func() bool {
				value, err := client.Bool(ctx, "feature", false, nil)
				return !value && errors.Is(err, ErrStale)
			})
		})
	}
}

func TestClientRevalidatesWhileDisconnected(t *testing.T) {
	service := newFakeService(t)
	service.stream = func(n int, r *http.Request, send func(string)) {
		if n == 1 {
			send(datafileMessage(testDatafile(1, true)))
			return
		}
		send("500")
	}
	service.datafile = func(int) (int, string) { return http.StatusOK, testDatafile(2, false) }
	client := service.client(
		WithStaleWhileRevalidate(time.Millisecond),
		func(c *config) { c.streamTiming.maxRetries, c.polling = 1000, false },
	)
	ctx := context.Background()

	if enabled, err := client.Bool(ctx, "feature", false, nil); err != nil || !enabled {
		t.Fatalf("Bool = %v, %v", enabled, err)
	}
	eventually(t, "an evaluation refreshes over HTTP", func() bool {
		enabled, err := client.Bool(ctx, "feature", true, nil)
		return err == nil && !enabled
	})
}

func TestClientReconnectsAfterPingTimeout(t *testing.T) {
	service := newFakeService(t)
	service.stream = func(n int, r *http.Request, send func(string)) {
		send(datafileMessage(testDatafile(n, true)))
		<-r.Context().Done()
	}
	client := service.client(func(c *config) { c.streamTiming.pingTimeout = 20 * time.Millisecond })

	if err := client.Initialize(context.Background()); err != nil {
		t.Fatal(err)
	}
	eventually(t, "the stream connects again", func() bool { return service.streamRequests.Load() >= 2 })
	// A silent connection is replaced. It is not a source failure.
	if !client.store.load().failingSince.IsZero() {
		t.Error("a ping timeout was recorded as a failure")
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if got := service.streamHeaders[1].Get("X-Revision"); got != "1" {
		t.Errorf("X-Revision on the second connection = %q, want 1", got)
	}
}

func TestClientExposureHandler(t *testing.T) {
	df := mustParse(t, `{"projectId":"p","environment":"production","definitions":{"flag":{
		"variants": ["a", "b"], "variantIds": ["va", "vb"],
		"experiment": {"id": "exp_1", "base": ["user", "id"], "weights": [1, 1], "defaultVariant": 0, "enrollmentSeed": 1, "rampId": "ramp_1", "rampPercentage": 100},
		"environments": {"production": {"fallthrough": {"type": "experiment"}}}}}}`)
	got := make(chan []Exposure, 1)
	client, err := NewClient(testSDKKey, WithDatafile(df), WithOffline(),
		WithExposureHandler(func(_ context.Context, exposures []Exposure, entities Entities) { got <- exposures }))
	if err != nil {
		t.Fatal(err)
	}
	defer client.Shutdown(context.Background())

	evaluation, err := client.Evaluate(context.Background(), "flag", Entities{"user": map[string]any{"id": "u1"}})
	if err != nil || evaluation.Experiment == nil {
		t.Fatalf("Evaluate = %+v, %v", evaluation, err)
	}
	exposures := <-got
	if len(exposures) != 1 {
		t.Fatalf("exposures = %+v", exposures)
	}
	exposure := exposures[0]
	experiment := exposure.Experiment
	if exposure.FlagKey != "flag" || experiment.ID != "exp_1" || experiment.VariantID != evaluation.VariantID ||
		experiment.AssignmentReason != AssignmentExperiment || experiment.RampID != "ramp_1" ||
		*experiment.RampPercentage != 100 || fmt.Sprint(experiment.Base) != "[user id]" {
		t.Errorf("exposure = %+v", exposure)
	}
}

func TestCredentials(t *testing.T) {
	keys := []struct {
		text string
		want string
	}{
		{"vf_server_abc", "vf_server_abc"},
		{"vf_client_abc", "vf_client_abc"},
		{"flags:edgeConfigId=ecfg_1&edgeConfigToken=t&sdkKey=vf_server_abc", "vf_server_abc"},
		{"flags:sdkKey=vf_other_abc", ""},
		{"vf_1PyH", ""},
		{"sdkKey=vf_server_abc", ""},
	}
	for _, tc := range keys {
		if got, _ := embedded.ParseSDKKey(tc.text); got != tc.want {
			t.Errorf("ParseSDKKey(%q) = %q, want %q", tc.text, got, tc.want)
		}
	}

	if _, err := NewClient("not a key"); err == nil {
		t.Error("NewClient accepted an invalid SDK key")
	}
	if _, err := NewClient(testSDKKey, WithProjectID("prj_other")); err == nil {
		t.Error("NewClient accepted a project id with an SDK key")
	}
	if _, err := NewClient("", WithProjectID("not valid!")); err == nil {
		t.Error("NewClient accepted an invalid project id")
	}

	t.Setenv("FLAGS", "flags:sdkKey=vf_server_env")
	client, err := NewClient("")
	if err != nil || client.creds.sdkKey != "vf_server_env" {
		t.Errorf("NewClient with FLAGS = %+v, %v", client, err)
	}
}

func TestClientOIDC(t *testing.T) {
	service := newFakeService(t)
	service.datafile = func(int) (int, string) { return http.StatusOK, testDatafile(1, true) }
	client, err := NewClient("",
		WithBaseURL(service.server.URL),
		WithProjectID("prj_other"),
		WithTokenSource(func(context.Context) (string, error) { return "oidc-token", nil }),
		WithoutStreaming(),
		fastTiming,
	)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Shutdown(context.Background())

	var header http.Header
	service.server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header = r.Header.Clone()
		_, _ = io.WriteString(w, testDatafile(1, true))
	})
	if err := client.Initialize(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := header.Get("Authorization"); got != "Bearer oidc-token" {
		t.Errorf("Authorization = %q", got)
	}
	if got := header.Get(sourceProjectHeader); got != "prj_other" {
		t.Errorf("%s = %q", sourceProjectHeader, got)
	}

}

func TestEntityValues(t *testing.T) {
	type account struct {
		Plan string   `json:"plan"`
		Tags []string `json:"tags"`
	}
	df := mustParse(t, `{"projectId":"p","environment":"production","definitions":{
		"plan": {"variants": [false, true], "environments": {"production": {"rules": [{"conditions": [[["account", "plan"], "eq", "pro"], [["account", "tags"], "containsAnyOf", ["beta"]]], "outcome": 1}], "fallthrough": 0}}},
		"age": {"variants": [false, true], "environments": {"production": {"rules": [{"conditions": [[["user", "age"], "gte", 18]], "outcome": 1}], "fallthrough": 0}}},
		"since": {"variants": [false, true], "environments": {"production": {"rules": [{"conditions": [[["user", "createdAt"], "before", "2024-01-01T00:00:00Z"]], "outcome": 1}], "fallthrough": 0}}}
	}}`)
	now := time.Now()
	plan := "pro"

	cases := []struct {
		key      string
		entities Entities
		want     bool
	}{
		{"plan", Entities{"account": account{Plan: "pro", Tags: []string{"beta"}}}, true},
		{"plan", Entities{"account": &account{Plan: "free", Tags: []string{"beta"}}}, false},
		{"plan", Entities{"account": map[string]any{"plan": &plan, "tags": []string{"x", "beta"}}}, true},
		{"age", Entities{"user": map[string]any{"age": 18}}, true},
		{"age", Entities{"user": map[string]int{"age": 17}}, false},
		{"age", Entities{"user": map[string]any{"age": uint8(40)}}, true},
		{"age", Entities{"user": map[string]any{"age": json.Number("21")}}, true},
		{"since", Entities{"user": map[string]any{"createdAt": time.Date(2023, 6, 1, 0, 0, 0, 0, time.FixedZone("x", 7200))}}, true},
		{"since", Entities{"user": map[string]any{"createdAt": time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)}}, false},
		{"age", nil, false},
	}
	for i, tc := range cases {
		evaluation, err := df.Evaluate(tc.key, tc.entities, now)
		if err != nil || evaluation.Value != tc.want {
			t.Errorf("case %d %s: %v, %v, want %v", i, tc.key, evaluation.Value, err, tc.want)
		}
	}
}

func TestInvalidDefinitionFailsOnlyThatFlag(t *testing.T) {
	df := mustParse(t, `{"projectId":"p","environment":"production","definitions":{
		"good": {"variants": [true], "environments": {"production": 0}},
		"bad": {"variants": "nope", "environments": {}}}}`)
	if evaluation, err := df.Evaluate("good", nil, time.Now()); err != nil || evaluation.Value != true {
		t.Errorf("good = %+v, %v", evaluation, err)
	}
	if _, err := df.Evaluate("bad", nil, time.Now()); !errors.Is(err, ErrInvalidDefinition) {
		t.Errorf("bad = %v, want ErrInvalidDefinition", err)
	}
	if keys := df.Keys(); fmt.Sprint(keys) != "[bad good]" {
		t.Errorf("Keys = %v", keys)
	}

	data, err := json.Marshal(df)
	if err != nil {
		t.Fatal(err)
	}
	var copy Datafile
	if err := json.Unmarshal(data, &copy); err != nil || copy.ProjectID != "p" {
		t.Errorf("round trip = %+v, %v", copy.ProjectID, err)
	}
}

func TestClientEmbeddedDefinitions(t *testing.T) {
	definitions := func(key string) []byte {
		data, _ := json.Marshal(embedded.File{
			Version:     embedded.Version,
			Definitions: map[string]json.RawMessage{key: json.RawMessage(testDatafile(5, true))},
		})
		return data
	}

	t.Run("fallback when no source is reachable", func(t *testing.T) {
		service := newFakeService(t)
		service.stream = func(n int, r *http.Request, send func(string)) { send("500") }
		client := service.client(WithEmbeddedDefinitions(definitions(embedded.HashSDKKey(testSDKKey))), WithInitTimeout(20*time.Millisecond))

		evaluation, err := client.Evaluate(context.Background(), "feature", nil)
		if err != nil || evaluation.Value != true {
			t.Fatalf("Evaluate = %+v, %v", evaluation, err)
		}
		if evaluation.Metrics.Source != SourceEmbedded {
			t.Errorf("Source = %q, want embedded", evaluation.Metrics.Source)
		}
		// The stream sends the revision of the embedded definitions.
		service.mu.Lock()
		defer service.mu.Unlock()
		if got := service.streamHeaders[0].Get("X-Revision"); got != "5" {
			t.Errorf("X-Revision = %q, want 5", got)
		}
	})

	t.Run("a source replaces the embedded definitions", func(t *testing.T) {
		service := newFakeService(t)
		service.stream = func(n int, r *http.Request, send func(string)) {
			send(datafileMessage(testDatafile(6, false)))
			<-r.Context().Done()
		}
		client := service.client(WithEmbeddedDefinitions(definitions(embedded.HashSDKKey(testSDKKey))))
		evaluation, err := client.Evaluate(context.Background(), "feature", nil)
		if err != nil || evaluation.Value != false || evaluation.Metrics.Source != SourceInMemory {
			t.Errorf("Evaluate = %+v, %v", evaluation, err)
		}
	})

	t.Run("a datafile has priority", func(t *testing.T) {
		service := newFakeService(t)
		client := service.client(WithOffline(),
			WithDatafile(mustParse(t, testDatafile(9, false))),
			WithEmbeddedDefinitions(definitions(embedded.HashSDKKey(testSDKKey))))
		if enabled, err := client.Bool(context.Background(), "feature", true, nil); err != nil || enabled {
			t.Errorf("Bool = %v, %v, want the value of the datafile", enabled, err)
		}
		if fallback, err := client.FallbackDatafile(context.Background()); err != nil || fallback.Revision != 5 {
			t.Errorf("FallbackDatafile = %+v, %v", fallback, err)
		}
	})

	t.Run("errors", func(t *testing.T) {
		service := newFakeService(t)
		none := service.client(WithOffline())
		if _, err := none.FallbackDatafile(context.Background()); !errors.Is(err, ErrFallbackNotFound) {
			t.Errorf("no embedded definitions: %v", err)
		}
		other := service.client(WithOffline(), WithEmbeddedDefinitions(definitions("another-key")))
		if _, err := other.FallbackDatafile(context.Background()); !errors.Is(err, ErrFallbackEntryNotFound) {
			t.Errorf("no entry: %v", err)
		}
	})

	t.Run("OIDC project", func(t *testing.T) {
		token := "h." + base64.RawURLEncoding.EncodeToString([]byte(`{"project_id":"prj_from_token"}`)) + ".s"
		t.Setenv("VERCEL_PROJECT_ID", "")
		client, err := NewClient("", WithOffline(),
			WithTokenSource(func(context.Context) (string, error) { return token, nil }),
			WithEmbeddedDefinitions(definitions("prj_from_token")))
		if err != nil {
			t.Fatal(err)
		}
		defer client.Shutdown(context.Background())
		if enabled, err := client.Bool(context.Background(), "feature", false, nil); err != nil || !enabled {
			t.Errorf("Bool = %v, %v", enabled, err)
		}
	})
}

func TestClientReportsOneReadForEachRequest(t *testing.T) {
	service := newFakeService(t)
	service.stream = func(n int, r *http.Request, send func(string)) {
		send(datafileMessage(testDatafile(2, true)))
		<-r.Context().Done()
	}
	client, err := NewClient(testSDKKey, WithBaseURL(service.server.URL), WithLogger(nil), fastTiming)
	if err != nil {
		t.Fatal(err)
	}

	handler := Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Two evaluations in one request are one read.
		_, _ = client.Bool(r.Context(), "feature", false, nil)
		_, _ = client.String(r.Context(), "color", "", nil)
	}))
	for i := range 2 {
		request := httptest.NewRequest(http.MethodGet, "https://shop.example/cart", nil)
		request.Header.Set("x-vercel-id", fmt.Sprintf("req_%d", i))
		handler.ServeHTTP(httptest.NewRecorder(), request)
	}
	// An evaluation outside a request reports no read.
	_, _ = client.Bool(context.Background(), "feature", false, nil)
	// A second mark of the same request is the same request.
	nested := NewRequestContext(NewRequestContext(context.Background(), nil), nil)
	_, _ = client.Bool(nested, "feature", false, nil)
	_, _ = client.Bool(nested, "feature", false, nil)
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}

	var reads []readPayload
	evaluations := 0
	for _, batch := range service.ingest {
		for _, event := range batch {
			switch event.Type {
			case "FLAGS_CONFIG_READ":
				var payload readPayload
				if err := json.Unmarshal(event.Payload, &payload); err != nil {
					t.Fatal(err)
				}
				reads = append(reads, payload)
			case "FLAG_EVALUATION":
				var payload evaluationPayload
				_ = json.Unmarshal(event.Payload, &payload)
				evaluations += int(payload.EvaluationCount)
			}
		}
	}
	if len(reads) != 3 || evaluations != 7 {
		t.Fatalf("%d reads and %d evaluations, want 3 and 7", len(reads), evaluations)
	}
	first, second := reads[0], reads[1]
	if first.VercelRequestID != "req_0" || first.InvocationHost != "shop.example" || first.CacheStatus != "MISS" ||
		!first.CacheIsBlocking || !first.CacheIsFirstRead || first.Mode != "stream" || first.CacheAction != "FOLLOWING" ||
		first.ConfigOrigin != "in-memory" || first.Revision != "2" || first.ConfigUpdatedAt != 2 {
		t.Errorf("first read = %+v", first)
	}
	if second.VercelRequestID != "req_1" || second.CacheStatus != "HIT" || second.CacheIsBlocking || second.CacheIsFirstRead {
		t.Errorf("second read = %+v", second)
	}
}

func TestClientDatafileIsASnapshot(t *testing.T) {
	service := newFakeService(t)
	service.datafile = func(int) (int, string) { return http.StatusOK, testDatafile(8, true) }
	client := service.client()

	// With no definitions, Datafile fetches them one time. It does not start
	// the stream.
	df, err := client.Datafile(context.Background())
	if err != nil || df.Revision != 8 {
		t.Fatalf("Datafile = %+v, %v", df, err)
	}
	again, _ := client.Datafile(context.Background())
	if again != df {
		t.Error("the second call did not return the stored datafile")
	}
	if streams, fetches := service.streamRequests.Load(), service.datafileRequests.Load(); streams != 0 || fetches != 1 {
		t.Errorf("%d stream requests and %d fetches, want 0 and 1", streams, fetches)
	}
}

func TestClientWithoutEvaluationMetrics(t *testing.T) {
	service := newFakeService(t)
	client, err := NewClient(testSDKKey, WithBaseURL(service.server.URL), WithLogger(nil),
		WithDatafile(mustParse(t, testDatafile(1, true))), WithoutStreaming(), WithoutPolling(),
		WithoutEvaluationMetrics())
	if err != nil {
		t.Fatal(err)
	}
	ctx := NewRequestContext(context.Background(), nil)
	_, _ = client.Bool(ctx, "feature", false, nil)
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
	// The read of the request is still reported.
	if len(service.ingest) != 1 || len(service.ingest[0]) != 1 || service.ingest[0][0].Type != "FLAGS_CONFIG_READ" {
		t.Errorf("ingest received %+v, want one read event", service.ingest)
	}
}
