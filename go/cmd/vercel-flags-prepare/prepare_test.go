package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	flags "github.com/vercel/flags/go"
	"github.com/vercel/flags/go/internal/embedded"
)

const datafile = `{"projectId":"prj_own","environment":"production","revision":3,"definitions":{"feature":{"variants":[false,true],"environments":{"production":1}}}}`

func oidcToken(projectID string) string {
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"project_id":"` + projectID + `"}`))
	return "header." + payload + ".signature"
}

func TestPrepare(t *testing.T) {
	var flaky atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == connectedSourcesPath:
			_, _ = io.WriteString(w, `{"data":[{"sourceProjectId":"prj_connected"},{"sourceProjectId":"prj_denied"},{"sourceProjectId":"prj_own"},{"sourceProjectId":"not valid!"}]}`)
		case r.Header.Get("X-Vercel-Flags-Project-Id") == "prj_denied":
			w.WriteHeader(http.StatusForbidden)
		case r.Header.Get("Authorization") == "Bearer vf_server_unknown":
			w.WriteHeader(http.StatusNotFound)
		case r.Header.Get("Authorization") == "Bearer vf_server_flaky" && flaky.Add(1) < 3:
			w.WriteHeader(http.StatusServiceUnavailable)
		default:
			if r.Header.Get("X-Vercel-Env") != "preview" {
				t.Errorf("X-Vercel-Env = %q", r.Header.Get("X-Vercel-Env"))
			}
			_, _ = io.WriteString(w, datafile)
		}
	}))
	defer server.Close()

	token := oidcToken("prj_own")
	output := filepath.Join(t.TempDir(), "nested", "flags-definitions.json")
	opts := defaultOptions()
	opts.env = map[string]string{
		"FLAGS":             "flags:edgeConfigId=ecfg_1&sdkKey=vf_server_one",
		"OTHER_FLAGS":       "vf_server_one",
		"FLAKY":             "vf_server_flaky",
		"UNKNOWN":           "vf_server_unknown",
		"STRIPE":            "vf_1PyH",
		"VERCEL_OIDC_TOKEN": token,
		"VERCEL_ENV":        "preview",
	}
	opts.output, opts.flagsURL, opts.apiURL, opts.retryDelay = output, server.URL, server.URL, time.Millisecond
	entries, err := run(context.Background(), opts)
	if err != nil || entries != 4 {
		t.Fatalf("run = %d, %v, want 4 entries", entries, err)
	}

	data, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "vf_server_") {
		t.Error("the file contains an SDK key")
	}
	var file embedded.File
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{embedded.HashSDKKey("vf_server_one"), embedded.HashSDKKey("vf_server_flaky"), "prj_own", "prj_connected"} {
		if _, ok := file.Definitions[key]; !ok {
			t.Errorf("no entry for %s", key)
		}
	}

	// A client finds its datafile in the file and starts with no network.
	client, err := flags.NewClient("vf_server_one",
		flags.WithEmbeddedDefinitions(data), flags.WithOffline())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Shutdown(context.Background())
	evaluation, err := client.Evaluate(context.Background(), "feature", nil)
	if err != nil || evaluation.Value != true || evaluation.Metrics.Source != flags.SourceEmbedded {
		t.Errorf("Evaluate = %+v, %v", evaluation, err)
	}
	fallback, err := client.FallbackDatafile(context.Background())
	if err != nil || fallback.Revision != 3 || fallback.FetchedAt.IsZero() {
		t.Errorf("FallbackDatafile = %+v, %v", fallback, err)
	}
}

func TestPrepareWithoutCredentials(t *testing.T) {
	opts := defaultOptions()
	opts.env = map[string]string{"PATH": "/bin"}
	opts.output = filepath.Join(t.TempDir(), "x.json")
	output := opts.output
	entries, err := run(context.Background(), opts)
	if err != nil || entries != 0 {
		t.Errorf("run = %d, %v, want no definitions", entries, err)
	}
	// The file exists, so that an embed directive compiles.
	data, err := os.ReadFile(output)
	if err != nil || !strings.Contains(string(data), `"definitions":{}`) {
		t.Errorf("file = %q, %v", data, err)
	}
}

func TestPrepareFailsOnClientError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()
	opts := defaultOptions()
	opts.env = map[string]string{"FLAGS": "vf_server_secret_key_that_is_long"}
	opts.output, opts.flagsURL = filepath.Join(t.TempDir(), "x.json"), server.URL
	_, err := run(context.Background(), opts)
	if err == nil || strings.Contains(err.Error(), "that_is_long") {
		t.Errorf("run = %v, want an error that hides the key", err)
	}
}
