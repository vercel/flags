package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	flags "github.com/vercel/flags/go"
	"github.com/vercel/flags/go/internal/embedded"
)

const (
	defaultFlagsURL = "https://flags.vercel.com"
	defaultAPIURL   = "https://api.vercel.com"
	// connectedSourcesPath lists the projects that gave this project access
	// to their flags.
	connectedSourcesPath = "/v1/feature-flags/connections/sources"

	defaultOutput = "flags-definitions.json"

	maxRetries              = 3
	connectedSourcesTimeout = 5 * time.Second
)

type options struct {
	// env is the environment to search for SDK keys and the OIDC token.
	env map[string]string
	// output is the path of the definitions file.
	output     string
	httpClient *http.Client
	logf       func(format string, args ...any)
	// flagsURL and apiURL are the service URLs. Tests replace them.
	flagsURL, apiURL string
	// retryDelay is the wait before the first retry.
	retryDelay time.Duration
}

func defaultOptions() options {
	env := map[string]string{}
	for _, pair := range os.Environ() {
		name, value, _ := strings.Cut(pair, "=")
		env[name] = value
	}
	return options{
		env:        env,
		output:     defaultOutput,
		httpClient: http.DefaultClient,
		logf:       func(string, ...any) {},
		flagsURL:   defaultFlagsURL,
		apiURL:     defaultAPIURL,
		retryDelay: 200 * time.Millisecond,
	}
}

type entry struct {
	// token is an SDK key or an OIDC token.
	token string
	// sourceProjectID is set for a connected project that is read with the
	// OIDC token of this project.
	sourceProjectID string
	// key is the key of the datafile in the file.
	key string
	// optional entries do not fail the run when their fetch fails.
	optional bool
}

// run finds the SDK keys and the OIDC token in the environment, fetches the
// flag definitions for each of them, and writes the definitions file. It
// returns the number of datafiles in the file.
//
// An SDK key is a value that starts with "vf_server_" or "vf_client_", or the
// sdkKey of a "flags:" connection string. The file contains the SHA-256 hash
// of each SDK key, not the key itself. With no SDK key and no OIDC token, the
// file has no definitions, so that an embed directive still finds it.
func run(ctx context.Context, opts options) (int, error) {
	file := embedded.File{
		Version:     embedded.Version,
		Definitions: map[string]json.RawMessage{},
	}
	entries := collectEntries(ctx, &opts)
	if len(entries) == 0 {
		opts.logf("no SDK key and no OIDC token in the environment")
	}
	for _, e := range entries {
		datafile, err := fetchDatafile(ctx, &opts, e)
		if err != nil {
			if e.optional {
				opts.logf("skipping connected project %s (%v)", e.sourceProjectID, err)
				continue
			}
			return 0, err
		}
		if datafile != nil {
			file.Definitions[e.key] = datafile
		}
	}

	data, err := json.Marshal(file)
	if err != nil {
		return 0, err
	}
	if dir := filepath.Dir(opts.output); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return 0, err
		}
	}
	if err := os.WriteFile(opts.output, append(data, '\n'), 0o644); err != nil {
		return 0, err
	}
	return len(file.Definitions), nil
}

func collectEntries(ctx context.Context, opts *options) []entry {
	sdkKeys := map[string]struct{}{}
	for _, value := range opts.env {
		if key, ok := embedded.ParseSDKKey(value); ok {
			sdkKeys[key] = struct{}{}
		}
	}

	var entries []entry
	for key := range sdkKeys {
		entries = append(entries, entry{token: key, key: embedded.HashSDKKey(key)})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].key < entries[j].key })
	if len(entries) > 0 {
		opts.logf("found %d SDK keys", len(entries))
	}

	token := opts.env["VERCEL_OIDC_TOKEN"]
	if token == "" {
		return entries
	}
	opts.logf("found OIDC token")
	ownProjectID, err := embedded.ProjectIDFromOIDCToken(token)
	if err == nil {
		entries = append(entries, entry{token: token, key: ownProjectID})
	}
	for _, projectID := range connectedSourceProjects(ctx, opts, token) {
		if projectID != ownProjectID {
			entries = append(entries, entry{token: token, sourceProjectID: projectID, key: projectID, optional: true})
		}
	}
	return entries
}

// connectedSourceProjects asks the Vercel API which projects gave this
// project access to their flags. A failure gives an empty list: a connected
// project that is not embedded still works at runtime.
func connectedSourceProjects(ctx context.Context, opts *options, token string) []string {
	ctx, cancel := context.WithTimeout(ctx, connectedSourcesTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, opts.apiURL+connectedSourcesPath, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", userAgent)
	res, err := opts.httpClient.Do(req)
	if err != nil {
		opts.logf("could not list connected projects (%v)", err)
		return nil
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		opts.logf("could not list connected projects (%d)", res.StatusCode)
		return nil
	}

	var body struct {
		Data []struct {
			SourceProjectID string `json:"sourceProjectId"`
		} `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil
	}
	var ids []string
	for _, row := range body.Data {
		if embedded.IsProjectID(row.SourceProjectID) {
			ids = append(ids, row.SourceProjectID)
		}
	}
	return ids
}

const userAgent = "vercel-flags-prepare-go/" + flags.Version

// fetchDatafile gets one datafile. It returns nil with no error for the
// status 404: the key has no definitions. It tries again for network
// failures and for the statuses 429 and 5xx.
func fetchDatafile(ctx context.Context, opts *options, e entry) (json.RawMessage, error) {
	label := obfuscate(e.token)
	if e.sourceProjectID != "" {
		label = "project " + e.sourceProjectID
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(opts.retryDelay << (attempt - 1)):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, opts.flagsURL+"/v1/datafile", nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+e.token)
		req.Header.Set("User-Agent", userAgent)
		if e.sourceProjectID != "" {
			req.Header.Set("X-Vercel-Flags-Project-Id", e.sourceProjectID)
		}
		for header, name := range map[string]string{
			"X-Vercel-Project-Id":    "VERCEL_PROJECT_ID",
			"X-Vercel-Env":           "VERCEL_ENV",
			"X-Vercel-Deployment-Id": "VERCEL_DEPLOYMENT_ID",
			"X-Vercel-Region":        "VERCEL_REGION",
		} {
			if value := opts.env[name]; value != "" {
				req.Header.Set(header, value)
			}
		}

		res, err := opts.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, readErr := io.ReadAll(res.Body)
		res.Body.Close()

		switch {
		case res.StatusCode == http.StatusOK && readErr == nil:
			return withFetchedAt(body)
		case res.StatusCode == http.StatusNotFound:
			return nil, nil
		}
		lastErr = fmt.Errorf("failed to fetch flag definitions for %s: %s", label, res.Status)
		if readErr != nil {
			lastErr = readErr
		} else if res.StatusCode != http.StatusTooManyRequests && res.StatusCode < 500 {
			return nil, lastErr
		}
	}
	return nil, lastErr
}

// withFetchedAt adds the fetch time to a datafile. The client then knows the
// age of the embedded definitions.
func withFetchedAt(body []byte) (json.RawMessage, error) {
	var datafile map[string]json.RawMessage
	if err := json.Unmarshal(body, &datafile); err != nil {
		return nil, errors.New("the datafile is not a JSON object")
	}
	datafile["fetchedAt"] = json.RawMessage(fmt.Sprint(time.Now().UnixMilli()))
	return json.Marshal(datafile)
}

// obfuscate hides all but the start of an SDK key or a token in a message.
func obfuscate(token string) string {
	const visible = 18
	if len(token) <= visible {
		return token
	}
	return token[:visible] + strings.Repeat("*", len(token)-visible)
}
