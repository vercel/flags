# Vercel Flags for Go

The Go client for [Vercel Flags](https://vercel.com/docs/flags). It evaluates feature flags in memory and gives the same results as the Node.js client `@vercel/flags-core`.

```bash
go get github.com/vercel/flags/go
```

The package name is `flags`. It needs Go 1.24 or later.

## Usage

```go
package main

import (
	"context"
	"log"
	"os"
	"time"

	flags "github.com/vercel/flags/go"
)

func main() {
	// The SDK key selects the project and the environment.
	client, err := flags.NewClient(os.Getenv("FLAGS"))
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		// Shutdown sends the usage events that are not sent yet.
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = client.Shutdown(ctx)
	}()

	ctx := context.Background()
	enabled, err := client.Bool(ctx, "new-checkout", false, flags.Entities{
		"user": map[string]any{"id": "u_123", "plan": "pro"},
	})
	if err != nil {
		// The value is the fallback. The error tells why.
		log.Print(err)
	}
	if enabled {
		// ...
	}
}
```

Create one client for the process and share it. A client is safe for concurrent use.

`NewClient` makes no request. It returns an error when an option is not valid or when it finds no credentials.

## Evaluation

| Method | Value |
| --- | --- |
| `Bool`, `String`, `Int`, `Float` | The typed value of the flag, or the fallback and an error |
| `Decode` | Stores a JSON object or list value in a Go value |
| `Evaluate` | The detailed result: value, variant ID, reason, outcome type and experiment |
| `EvaluateAll` | The detailed results of many flags against one version of the definitions |

When an evaluation fails, the typed methods return the fallback value and an error. Test the error with `errors.Is`:

| Error | Cause |
| --- | --- |
| `ErrFlagNotFound` | The flag does not exist. |
| `ErrTypeMismatch` | The value has a different type than the method. |
| `ErrNoData` | The client has no flag definitions. The error also wraps the cause, for example `ErrUnauthorized`. |
| `ErrStale` | The sources failed for longer than `WithStaleIfError`. |
| `ErrUnauthorized` | Vercel rejected the credentials, or there are none. |
| `ErrInvalidDefinition` | The definition of the flag is not valid. |

### Entities

`Entities` is the evaluation context. The keys are entity kinds, and each value holds the attributes of that entity.

Attribute values can be strings, numbers, booleans, lists, maps and `time.Time` values. A struct takes the form that `encoding/json` gives it, so `json` tags select the attribute names. The client converts a struct one time for each evaluation call. Maps need no conversion.

An evaluation through the client takes approximately 180 ns with no allocation. Evaluations on different cores do not wait for each other.

## Sources of flag definitions

1. **Stream.** The client keeps one connection to Vercel Flags and receives each change at once.
2. **Polling.** When the stream fails 15 times in sequence, the client fetches the definitions each 30 seconds.
3. **Last definitions.** When no source is reachable, the client continues with the definitions it has. While the stream is disconnected, evaluations refresh old definitions over HTTP in the background.

The first evaluation connects the client and waits a maximum of 3 seconds for data. The client waits only one time: later evaluations use the definitions that the client has. Call `Initialize` at startup to do this early and to see a configuration error.

| Option | Function |
| --- | --- |
| `WithDatafile(df)` | Definitions for the start and as the fallback. Store them with `json.Marshal(datafile)`. |
| `WithEmbeddedDefinitions(data)` | The definitions file from `vercel-flags-prepare`, as the fallback |
| `WithOffline()` | No requests at all: no stream, no polling, no fetch and no usage reports. The client needs no SDK key. |
| `WithoutStreaming()`, `WithoutPolling()` | Disables one source. With the two options, the client fetches the definitions one time. |
| `WithPollInterval(d)`, `WithInitTimeout(d)` | Timing of the sources |
| `WithStaleWhileRevalidate(d)`, `WithStaleIfError(d)` | How long old definitions are served |
| `WithProjectID(id)`, `WithTokenSource(fn)` | Authentication with a Vercel OIDC token and no SDK key |
| `WithHTTPClient(c)`, `WithBaseURL(url)`, `WithLogger(l)` | Infrastructure |
| `WithClientName(n)`, `WithMetricEnvironment(e)`, `WithoutEvaluationMetrics()` | Evaluation metrics |

### Authentication

- **SDK key.** Pass `vf_server_...` or the `flags:` connection string to `NewClient`. An empty string reads the `FLAGS` environment variable.
- **OIDC.** With no SDK key, the client sends a Vercel OIDC token. It reads `VERCEL_OIDC_TOKEN`, or calls the function from `WithTokenSource`. `WithProjectID` reads the flags of a connected project.

## Embedded definitions

Embedded definitions are the fallback for a start with no network. They are the Go equivalent of `@vercel/flags-definitions` in the Node.js client.

1. Fetch the definitions at build time. The command reads the SDK keys and `VERCEL_OIDC_TOKEN` from the environment.

   ```bash
   go run github.com/vercel/flags/go/cmd/vercel-flags-prepare -o flags-definitions.json
   ```

2. Embed the file and give it to the client.

   ```go
   //go:embed flags-definitions.json
   var definitions []byte

   client, err := flags.NewClient(os.Getenv("FLAGS"), flags.WithEmbeddedDefinitions(definitions))
   ```

Go needs the file at compile time. Run the command in the build before `go build`, for example with a `//go:generate` line and `go generate ./...`. With no SDK key and no OIDC token in the environment, the command writes a file with no definitions, so the build still works. Do not commit the file: it contains the definitions of one moment.

The file contains the SHA-256 hash of each SDK key, not the key. The client uses the embedded definitions until a source delivers newer ones, and when no source is reachable. `WithDatafile` has priority. `client.FallbackDatafile` returns the embedded definitions, or `ErrFallbackNotFound` or `ErrFallbackEntryNotFound`.

## Usage reporting

The client reports usage to Vercel in batches, as the Node.js client does. It sends a batch after 5 seconds with no new event, or after 60 seconds. `Shutdown` completes a send that is in progress and sends the last batch.

- **Evaluations.** Each evaluation is counted for each flag, variant and reason. `WithoutEvaluationMetrics` stops these reports.
- **Reads.** The client reports one read of the definitions for each request. A Go program has no global request context, so mark each request:

  ```go
  http.ListenAndServe(":8080", flags.Middleware(mux))
  ```

  Then pass `r.Context()` to the evaluations. Outside `net/http`, use `flags.NewRequestContext`. An evaluation with a context that has no mark reports no read.

`Evaluation.Metrics` tells how the client got the definitions for one evaluation: the source (`in-memory`, `embedded` or `remote`), the cache status, the mode and the durations.

## Tests

Use a datafile and no network:

```go
df, _ := flags.ParseDatafile(json)
client, _ := flags.NewClient("", flags.WithDatafile(df), flags.WithOffline())
```

`Datafile.Evaluate` evaluates one flag with no client, at a time that you give. Use it to test a progressive rollout.

## Differences from the Node.js client

### Evaluation

The evaluator is a port of the evaluator of `@vercel/flags-core`. A unit gets the same variant of a split, a rollout or an experiment from the two clients. The results are different only for these inputs:

| Input | Node.js client | Go client |
| --- | --- | --- |
| Date strings in other formats, for example `"2024-6-15"`, `"2024-06-15 12:00Z"`, `"Jan 1, 2020"`, `"10"` or `"user-123"` | V8 parses many of them as dates, so `before` and `after` can match. | They are not dates. The condition does not match. |
| Case-insensitive regex on letters with no one-to-one case mapping, for example `ẞ`, `ſ` and the Kelvin sign | ECMAScript canonicalization rules | The rules of the `regexp2` engine |
| Regex with the `v` flag | Supported | The pattern never matches. |
| Regex without the `u` flag on characters above U+FFFF | Matches UTF-16 code units | Matches code points |
| Regex with catastrophic backtracking | Blocks the process until the match completes | Stops after 1 second. The condition does not match. |
| Entity paths through inherited JavaScript properties, for example `toString` or `constructor` | Reads the inherited property | A missing value. The `length` of a list is supported. |
| Strings with unpaired UTF-16 surrogates | Compared as they are | Go replaces them with U+FFFD when it decodes JSON. |
| Definitions that do not have the packed format | Depends on the JavaScript operations that the evaluator reaches | The evaluation of that flag returns an error. |
| Segments that refer to themselves | Stack overflow error | Error after 64 levels |

### Client

The Go client does not have the parts of the Node.js client that are specific to Next.js and Vercel Functions:

- Build-step detection. Embedded definitions replace the bundled definitions: see above.
- The Vercel runtime mode that reads the project version from request headers.
- The ingest transport and the flag value reports of the Vercel Functions runtime for Node.js. The Go client sends all usage over HTTP.
- An OpenFeature provider.

## Development

```bash
go test -race ./...
```
