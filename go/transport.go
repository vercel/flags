package flags

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"os"
	"strconv"
	"time"
)

// Version is the version of this module.
const Version = "0.1.0"

const (
	userAgent = "VercelFlagsGo/" + Version

	// fetchTimeout is the limit for one datafile fetch. It includes the
	// token, all attempts, the waits between them and the body.
	fetchTimeout     = 10 * time.Second
	maxFetchAttempts = 3
	fetchRetryDelay  = 100 * time.Millisecond
)

// transport sends the requests of a client to the Vercel Flags service.
type transport struct {
	baseURL string
	// http is the client for short requests. stream is the same client with
	// no timeout, for the stream request.
	http   *http.Client
	stream *http.Client
	creds  *credentials
}

func newTransport(cfg *config, creds *credentials) *transport {
	client := cfg.httpClient
	if client == nil {
		client = &http.Client{}
	}
	stream := *client
	stream.Timeout = 0
	return &transport{baseURL: cfg.baseURL, http: client, stream: &stream, creds: creds}
}

func (t *transport) newRequest(ctx context.Context, method, path string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, t.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	if err := t.creds.authorize(ctx, req); err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	if env := os.Getenv("VERCEL_ENV"); env != "" {
		req.Header.Set("X-Vercel-Env", env)
	}
	return req, nil
}

// statusError is a response with a status that is not successful.
type statusError struct {
	status int
}

func (e *statusError) Error() string {
	return fmt.Sprintf("flags: unexpected response status %d %s", e.status, http.StatusText(e.status))
}

func (e *statusError) retryable() bool {
	return e.status == http.StatusRequestTimeout || e.status == http.StatusTooManyRequests || e.status >= 500
}

// fetchDatafile gets the datafile with GET /v1/datafile. It tries three
// times for network failures and for the statuses 408, 429 and 5xx.
func (t *transport) fetchDatafile(ctx context.Context) (*Datafile, error) {
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()

	var lastErr error
	for attempt := 0; attempt < maxFetchAttempts; attempt++ {
		if attempt > 0 {
			if err := sleep(ctx, fetchRetryDelay<<(attempt-1)); err != nil {
				break
			}
		}
		df, err := t.fetchDatafileOnce(ctx)
		if err == nil {
			return df, nil
		}
		lastErr = err

		var status *statusError
		if errors.Is(err, ErrUnauthorized) || (errors.As(err, &status) && !status.retryable()) {
			break
		}
	}
	if ctx.Err() != nil && !errors.Is(lastErr, ErrUnauthorized) {
		return nil, fmt.Errorf("flags: fetch datafile: %w (last error: %v)", context.Cause(ctx), lastErr)
	}
	return nil, fmt.Errorf("flags: fetch datafile: %w", lastErr)
}

func (t *transport) fetchDatafileOnce(ctx context.Context) (*Datafile, error) {
	req, err := t.newRequest(ctx, http.MethodGet, "/v1/datafile", nil)
	if err != nil {
		return nil, err
	}
	res, err := t.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer drain(res.Body)

	if res.StatusCode == http.StatusUnauthorized {
		return nil, t.creds.unauthorizedError()
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, &statusError{status: res.StatusCode}
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	return ParseDatafile(body)
}

// -----------------------------------------------------------------------------
// Stream
// -----------------------------------------------------------------------------

type streamTiming struct {
	// maxRetries is the number of failed connections in sequence after which
	// the stream stops.
	maxRetries int
	// baseDelay is the wait before the second retry. Each retry after that
	// doubles it. It is also the minimum time between two connections.
	baseDelay time.Duration
	maxDelay  time.Duration
	// jitter is the maximum random time that is added to each wait.
	jitter time.Duration
	// pingTimeout is the longest silence on a connection. The server sends a
	// ping each 30 seconds.
	pingTimeout time.Duration
}

var defaultStreamTiming = streamTiming{
	maxRetries:  15,
	baseDelay:   time.Second,
	maxDelay:    time.Minute,
	jitter:      time.Second,
	pingTimeout: 90 * time.Second,
}

func (t streamTiming) backoff(retry int) time.Duration {
	if retry <= 1 {
		return 0
	}
	delay := min(t.baseDelay<<(retry-2), t.maxDelay)
	if t.jitter > 0 {
		delay += rand.N(t.jitter)
	}
	return delay
}

// streamMessage is one line of the NDJSON stream.
type streamMessage struct {
	Type string `json:"type"`
	// Data is the datafile of a "datafile" message.
	Data json.RawMessage `json:"data"`
	// The fields below belong to a "primed" message. The server sends it in
	// place of a datafile when the revision of the client is current.
	Revision    int64  `json:"revision"`
	ProjectID   string `json:"projectId"`
	Environment string `json:"environment"`
}

var errPingTimeout = errors.New("flags: stream ping timeout")

// followStream connects to GET /v1/stream and reads messages until the
// client closes or the stream gives up. It connects again after each failure.
// The returned error is nil when the client closes.
func (c *Client) followStream() error {
	ctx, timing := c.ctx, c.cfg.streamTiming
	retry := 0
	receivedData := false
	var lastErr error

	for ctx.Err() == nil {
		if retry > timing.maxRetries {
			return fmt.Errorf("flags: stream stopped after %d retries: %w", timing.maxRetries, lastErr)
		}

		started := time.Now()
		err := c.readStream(ctx, retry, &receivedData, &retry)
		if ctx.Err() != nil {
			return nil
		}
		// A ping timeout is not a failure: the stream connects again and the
		// definitions stay valid.
		if !errors.Is(err, errPingTimeout) {
			lastErr = err
			c.connected.Store(false)
			c.sourceFailed(err)
			c.logger.Debug("flags: stream disconnected", "error", err)
		}
		if errors.Is(err, ErrUnauthorized) {
			return err
		}

		retry++
		delay := max(timing.backoff(retry), timing.baseDelay-time.Since(started))
		if sleep(ctx, delay) != nil {
			return nil
		}
	}
	return nil
}

// readStream reads one connection until it ends. It sets *retry to 0 when a
// message shows that the connection works.
func (c *Client) readStream(ctx context.Context, attempt int, receivedData *bool, retry *int) error {
	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)

	req, err := c.transport.newRequest(ctx, http.MethodGet, "/v1/stream", nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Retry-Attempt", strconv.Itoa(attempt))
	// The stream is one datafile and small pings, so compression gains
	// little, and a decoder can hold back a small first message.
	req.Header.Set("Accept-Encoding", "identity")
	// With the revision, the server can confirm the definitions of the
	// client with a small "primed" message.
	if df := c.store.load().datafile; df != nil && df.hasRevision {
		req.Header.Set("X-Revision", strconv.FormatInt(df.Revision, 10))
	}

	res, err := c.transport.stream.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized {
		return c.creds.unauthorizedError()
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return &statusError{status: res.StatusCode}
	}

	// The watchdog ends a connection that is silent for too long. It starts
	// after the first data, so the init timeout stays in control before that.
	pingTimeout := c.cfg.streamTiming.pingTimeout
	var watchdog *time.Timer
	resetWatchdog := func() {
		if !*receivedData {
			return
		}
		if watchdog == nil {
			watchdog = time.AfterFunc(pingTimeout, func() { cancel(errPingTimeout) })
			return
		}
		watchdog.Reset(pingTimeout)
	}
	defer func() {
		if watchdog != nil {
			watchdog.Stop()
		}
	}()
	resetWatchdog()

	reader := bufio.NewReaderSize(res.Body, 64<<10)
	for {
		line, err := reader.ReadBytes('\n')
		if len(bytes.TrimSpace(line)) > 0 && c.handleStreamLine(line, *receivedData) {
			*receivedData = true
			*retry = 0
			resetWatchdog()
		}
		if err != nil {
			if cause := context.Cause(ctx); errors.Is(cause, errPingTimeout) {
				return errPingTimeout
			}
			if errors.Is(err, io.EOF) {
				return errors.New("flags: stream closed by the server")
			}
			return err
		}
	}
}

// handleStreamLine handles one message. It returns true when the message
// shows that the connection works.
func (c *Client) handleStreamLine(line []byte, receivedData bool) bool {
	var msg streamMessage
	if err := json.Unmarshal(line, &msg); err != nil {
		// Skip a line that is not a message.
		return false
	}

	switch msg.Type {
	case "datafile":
		df, err := ParseDatafile(msg.Data)
		if err != nil {
			return false
		}
		c.accept(df, originStream)
	case "primed":
		// The server confirms that the revision of the client is current.
		df := c.store.load().datafile
		if df != nil && df.hasRevision && df.Revision == msg.Revision &&
			df.ProjectID == msg.ProjectID && df.Environment == msg.Environment {
			c.store.confirm(time.Now())
		}
	case "ping":
		// A ping before the first data proves nothing.
		if !receivedData {
			return false
		}
		c.store.confirm(time.Now())
	default:
		return false
	}

	c.unauthorized.Store(false)
	c.connected.Store(true)
	c.markReady()
	return true
}

// sleep waits for d or until ctx is done.
func sleep(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
