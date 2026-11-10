package flags

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

const (
	defaultBaseURL              = "https://flags.vercel.com"
	defaultInitTimeout          = 3 * time.Second
	defaultPollInterval         = 30 * time.Second
	minPollInterval             = 30 * time.Second
	defaultStaleWhileRevalidate = 10 * time.Second
	// noLimit is the stale-if-error time of a client that serves its last
	// definitions for as long as its sources fail.
	noLimit time.Duration = -1
)

// Option configures a Client. NewClient returns an error for an option with
// a value that is not valid.
type Option func(*config)

type config struct {
	baseURL              string
	httpClient           *http.Client
	tokenSource          TokenSource
	projectID            string
	datafile             *Datafile
	embedded             []byte
	offline              bool
	stream               bool
	polling              bool
	pollInterval         time.Duration
	initTimeout          time.Duration
	staleWhileRevalidate time.Duration
	staleIfError         time.Duration
	logger               *slog.Logger
	clientName           string
	metricEnvironment    string
	evaluationMetrics    bool
	exposureHandler      ExposureHandler
	// errs collects the options that are not valid.
	errs []error

	// The values below change only in tests.
	streamTiming streamTiming
	usageTiming  usageTiming
}

func defaultConfig() config {
	return config{
		baseURL:              defaultBaseURL,
		stream:               true,
		polling:              true,
		pollInterval:         defaultPollInterval,
		initTimeout:          defaultInitTimeout,
		staleWhileRevalidate: defaultStaleWhileRevalidate,
		staleIfError:         noLimit,
		logger:               slog.Default(),
		evaluationMetrics:    true,
		streamTiming:         defaultStreamTiming,
		usageTiming:          defaultUsageTiming,
	}
}

func (c *config) invalid(format string, args ...any) {
	c.errs = append(c.errs, fmt.Errorf("flags: "+format, args...))
}

func (c *config) err() error { return errors.Join(c.errs...) }

// WithDatafile gives the client a datafile to use until a source delivers a
// newer one. The client also uses it when no source is reachable.
func WithDatafile(datafile *Datafile) Option {
	return func(c *config) { c.datafile = datafile }
}

// WithEmbeddedDefinitions gives the client the flag definitions that the
// vercel-flags-prepare command wrote at build time. Embed the file in the
// binary:
//
//	//go:embed flags-definitions.json
//	var definitions []byte
//
//	client, err := flags.NewClient(sdkKey, flags.WithEmbeddedDefinitions(definitions))
//
// The client uses these definitions when it has no datafile from WithDatafile
// and until a source delivers newer ones. They are the fallback when Vercel
// Flags is not reachable. FallbackDatafile returns them.
func WithEmbeddedDefinitions(data []byte) Option {
	return func(c *config) { c.embedded = data }
}

// WithOffline makes a client that sends no requests: it does not stream, does
// not poll, does not fetch and does not report usage. It evaluates the flags
// of WithDatafile or WithEmbeddedDefinitions, and it needs no SDK key. Use it
// in tests.
func WithOffline() Option {
	return func(c *config) { c.offline = true }
}

// WithoutStreaming makes polling the source of flag definitions. By default
// the client streams updates and polls only when the stream fails.
//
// With WithoutStreaming and WithoutPolling, the client fetches the
// definitions one time when it has none.
func WithoutStreaming() Option {
	return func(c *config) { c.stream = false }
}

// WithoutPolling stops the fallback to polling when the stream fails.
func WithoutPolling() Option {
	return func(c *config) { c.polling = false }
}

// WithPollInterval sets the time between two polls. The default and the
// minimum are 30 seconds.
func WithPollInterval(interval time.Duration) Option {
	return func(c *config) {
		if interval < minPollInterval {
			c.invalid("the poll interval must be %v or more, got %v", minPollInterval, interval)
			return
		}
		c.pollInterval = interval
	}
}

// WithInitTimeout sets how long the client waits for the first data from the
// stream or the first poll. After this time the client uses the definitions
// it has, or fetches them one time. The client waits only one time: later
// evaluations do not wait again. The default is 3 seconds. Zero means no
// limit.
func WithInitTimeout(timeout time.Duration) Option {
	return func(c *config) {
		if timeout < 0 {
			c.invalid("the init timeout must not be negative, got %v", timeout)
			return
		}
		c.initTimeout = timeout
	}
}

// WithStaleWhileRevalidate sets how old the definitions can be before the
// client refreshes them in the background while the stream is disconnected.
// The default is 10 seconds.
func WithStaleWhileRevalidate(d time.Duration) Option {
	return func(c *config) {
		if d < 0 {
			c.invalid("the stale-while-revalidate time must not be negative, got %v", d)
			return
		}
		c.staleWhileRevalidate = d
	}
}

// WithStaleIfError sets how long the client continues to serve its last
// definitions after its sources start to fail. After this time, evaluations
// return the fallback value and ErrStale. Zero means the client stops at the
// first failure. By default there is no limit.
func WithStaleIfError(d time.Duration) Option {
	return func(c *config) {
		if d < 0 {
			c.invalid("the stale-if-error time must not be negative, got %v", d)
			return
		}
		c.staleIfError = d
	}
}

// WithProjectID reads the flags of another project in the same team with the
// OIDC token of this deployment. The other project must have a connection to
// this project. It cannot be combined with an SDK key.
func WithProjectID(projectID string) Option {
	return func(c *config) { c.projectID = projectID }
}

// WithTokenSource sets the source of the Vercel OIDC token for a client with
// no SDK key. By default the client reads the VERCEL_OIDC_TOKEN environment
// variable.
func WithTokenSource(source TokenSource) Option {
	return func(c *config) { c.tokenSource = source }
}

// WithHTTPClient sets the HTTP client for all requests. The client ignores
// its Timeout for the stream, which is one long request.
func WithHTTPClient(client *http.Client) Option {
	return func(c *config) { c.httpClient = client }
}

// WithBaseURL sets the URL of the Vercel Flags service. The default is
// https://flags.vercel.com.
func WithBaseURL(baseURL string) Option {
	return func(c *config) { c.baseURL = baseURL }
}

// WithLogger sets the logger. The default is slog.Default. A nil logger
// stops all log output. The client logs a source that gives up as an error
// and normal operation at the debug level.
func WithLogger(logger *slog.Logger) Option {
	return func(c *config) {
		if logger == nil {
			logger = slog.New(slog.DiscardHandler)
		}
		c.logger = logger
	}
}

// WithClientName sets a name that is included in the evaluation metrics.
func WithClientName(name string) Option {
	return func(c *config) { c.clientName = name }
}

// WithMetricEnvironment sets the environment that is included in the
// evaluation metrics: "production", "preview" or "development". The default is
// the VERCEL_ENV environment variable. It does not select the environment
// that flags are evaluated for: the SDK key does that.
func WithMetricEnvironment(environment string) Option {
	return func(c *config) { c.metricEnvironment = environment }
}

// WithoutEvaluationMetrics stops the reports of how many times each flag was
// evaluated. The client continues to report one read of the definitions for
// each request: see NewRequestContext.
func WithoutEvaluationMetrics() Option {
	return func(c *config) { c.evaluationMetrics = false }
}

// Exposure is one evaluation of a flag that is linked to an experiment.
type Exposure struct {
	// FlagKey is the key of the evaluated flag.
	FlagKey string
	// Experiment is the assignment that the evaluation gave.
	Experiment ExperimentAssignment
}

// ExposureHandler receives the experiment exposures of one evaluation call
// and the entities of that call. It must not change the entities.
type ExposureHandler func(ctx context.Context, exposures []Exposure, entities Entities)

// WithExposureHandler sets a function that receives experiment exposures.
// The client calls it from one separate goroutine, in the order of the
// evaluations, and Shutdown waits for it. When the handler is slower than the
// evaluations, the client drops exposures.
//
// This API is experimental. Do not use it unless Vercel enabled it for you.
func WithExposureHandler(handler ExposureHandler) Option {
	return func(c *config) { c.exposureHandler = handler }
}
