# @vercel/flags-core

Core feature flag evaluation engine for Vercel. Handles flag evaluation, real-time updates via streaming, and usage tracking.

## Package Structure

```
src/
├── index.default.ts      # Default exports
├── index.next-js.ts      # Next.js exports (with 'use cache')
├── index.common.ts       # Shared exports
├── index.make.ts         # Client factory
├── types.ts              # Type definitions
├── errors.ts             # Error classes
├── evaluate.ts           # Core evaluation logic
├── controller-fns.ts     # Controller function wrappers + instance map
├── create-raw-client.ts  # Raw client factory (ID-based indirection for 'use cache')
├── controller/           # Controller (state machine) and I/O sources
│   ├── index.ts              # Controller class
│   ├── stream-source.ts      # StreamSource (wraps stream-connection)
│   ├── polling-source.ts     # PollingSource (wraps fetch-datafile)
│   ├── bundled-source.ts     # BundledSource (wraps read-bundled-definitions)
│   ├── stream-connection.ts  # Low-level NDJSON stream connection
│   ├── fetch-datafile.ts     # HTTP datafile fetch
│   ├── tagged-data.ts        # Data origin tagging types/helpers
│   ├── normalized-options.ts # Option normalization
│   └── typed-emitter.ts      # Lightweight typed event emitter
├── openfeature.*.ts      # OpenFeature provider
├── test-utils.ts         # Shared test helpers
├── utils/                # Utilities
│   ├── usage-tracker.ts
│   ├── sdk-keys.ts
│   ├── sleep.ts
│   └── read-bundled-definitions.ts
└── lib/
    └── report-value.ts   # Flag evaluation reporting to Vercel request context
```

## Architecture

### Data flow

```
createClient(sdkKey, options)
  → Controller (state machine, owns all data tagging and source coordination)
    → StreamSource / PollingSource / BundledSource (emit raw DatafileInput)
  → create-raw-client (ID-based indirection for 'use cache' support)
    → controller-fns (lookup by ID, evaluate, report)
  → FlagsClient (public API)
```

### Design principles

- **Sources emit raw data** — StreamSource, PollingSource, and BundledSource return/emit raw `DatafileInput`. The Controller is solely responsible for tagging data with its origin (`tagData(data, 'stream')` etc.).
- **BundledSource is a plain class** — unlike StreamSource and PollingSource which extend TypedEmitter, BundledSource has no event listeners. The Controller calls its methods directly and uses return values.
- **Tests are black-box** — all behavioral tests go through the public API (`createClient` from `./index.default`). Mock `readBundledDefinitions` and `internalReportValue` as observable I/O. Use `fetchMock` for network assertions.
- **ID-based indirection** — `controller-fns.ts` holds a `controllerInstanceMap` (Map<number, ControllerInstance>) so that `'use cache'` wrappers in Next.js can pass serializable IDs instead of function references.

## Key Concepts

### FlagsClient

Main interface for interacting with flags:

```typescript
type FlagsClient = {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getDatafile(): Promise<Datafile>;
  getFallbackDatafile(): Promise<BundledDefinitions>;
  evaluate<T, E>(flagKey, defaultValue?, entities?): Promise<EvaluationResult<T>>;
}
```

### Evaluation Flow

1. Retrieve flag definition from datafile
2. Look up environment config
3. Check targeting rules (shortcut for immediate match)
4. Evaluate segment-based rules against entity context
5. Return fallthrough default if no match

### Controller Options

```typescript
type ControllerOptions = {
  sdkKey: string;
  datafile?: Datafile;  // Initial datafile for immediate reads
  stream?: boolean | { initTimeoutMs: number };      // default: true (3000ms)
  polling?: boolean | { intervalMs: number; initTimeoutMs: number };  // default: true (30s interval, 3s timeout)
  buildStep?: boolean;  // Override build step auto-detection
  sources?: { stream?: StreamSource; polling?: PollingSource; bundled?: BundledSource };  // DI for testing
};
```

### Data Source Priority (Fallback Chain)

Behavior differs based on environment:

**Build step** (CI=1, NEXT_PHASE=phase-production-build, or `buildStep: true`):
1. **Provided datafile** - Use `options.datafile` if provided
2. **Bundled definitions** - Use `@vercel/flags-definitions`
3. **One-time fetch** - Fallback network request
4. **Throw** - If all above fail

Build-step reads are deduplicated: data is loaded once via a shared promise (`buildDataPromise`) and all concurrent `evaluate()` calls share the result. The entire build counts as a single tracked read event (`buildReadTracked` flag in Controller).

**Runtime** (default, or `buildStep: false`):
1. **Stream** - Real-time updates via NDJSON streaming, wait up to `initTimeoutMs`
2. **Polling** - Interval-based HTTP requests, wait up to `initTimeoutMs`
3. **Provided datafile** - Use `options.datafile` if provided
4. **Bundled definitions** - Use `@vercel/flags-definitions`
5. **One-time fetch** - Last resort (only when stream and polling are both disabled)

Key behaviors:
- Bundled definitions are loaded eagerly so their revision can be sent to the stream via `X-Revision` header
- When streaming or polling is enabled and data already exists (bundled or provided), `initialize()` still waits for fresh data (stream confirmation or first poll) up to `initTimeoutMs`, then falls back to existing data on timeout
- For offline mode with existing data, `initialize()` returns immediately
- **Never stream AND poll simultaneously**
- If stream reconnects while polling → stop polling
- If stream disconnects → start polling (if enabled)
- Use `buildStep: true` to force static-only mode (e.g., serverless cold starts)
- Use `buildStep: false` to force runtime mode (e.g., custom build environments)

### Resolution Reasons

- `TARGET_MATCH` - Matched targeting rules
- `RULE_MATCH` - Matched conditional rules
- `FALLTHROUGH` - No match, returned fallback
- `PAUSED` - Flag is paused
- `ERROR` - Evaluation error

### Packed Format

Internal compact format for flag definitions:
- Variants stored as indices
- Conditions use tuples: `[LHS, Comparator, RHS]` (e.g., `[['user', 'id'], Comparator.EQ, 'user-123']`)
- Targets shorthand: `{ user: { id: ['user-123'] } }`
- Entities accessed via path arrays (e.g., `['user', 'id']`)

## Entry Points

The package has conditional exports based on environment:

- **Default**: `./dist/index.default.js` - Standard usage
- **Next.js**: `./dist/index.next-js.js` - Wraps functions with `'use cache'`
- **OpenFeature**: `./openfeature` - OpenFeature server SDK provider

## Commands

All commands must be run from the package directory (`packages/vercel-flags-core`):

```bash
# Build
pnpm build

# Run all tests
pnpm test

# Run a single test file
pnpm vitest --run src/black-box.test.ts

# Run a single test file in watch mode
pnpm vitest src/black-box.test.ts

# Type check
pnpm check

# Integration tests (requires INTEGRATION_TEST_CONNECTION_STRING)
pnpm test:integration
```

## Test Guidelines (black-box.test.ts)

### Critical rules

- **All tests must use fake timers** unless there is a specific reason to use `vi.useRealTimers()`. The `beforeEach` sets up fake timers; only opt out when testing real async timing.
- **No stderr leaks**: every `console.warn` and `console.error` the implementation emits must be captured by a spy (`vi.spyOn(console, 'warn').mockImplementation(() => {})`) and asserted. A test that produces stderr output is broken.
- **Tests should complete in milliseconds**, not seconds. If a test takes ~3s, it's hitting a real timeout instead of advancing fake timers.

### initialize() blocks on stream/poll confirmation

`initialize()` waits for fresh data before resolving, even when bundled data or a provided datafile is available:
- **Streaming**: waits for a stream message (`primed` or `datafile`) up to `initTimeoutMs`
- **Polling**: waits for the first poll response up to `initTimeoutMs`

This means:

- **With fake timers**: call `client.initialize()` (or `client.evaluate()` which triggers lazy init), then `await vi.advanceTimersByTimeAsync(initTimeoutMs)` to trigger the timeout fallback.
- **With real timers (`vi.useRealTimers()`)**: for streaming, you MUST push a stream message before awaiting `initialize()`, otherwise it blocks for the real 3s timeout:
  ```typescript
  const initPromise = client.initialize();
  await new Promise((r) => setTimeout(r, 0)); // let stream connect
  stream.push({ type: 'primed', revision: 42, projectId: 'prj_123', environment: 'production' });
  await initPromise; // resolves immediately
  ```
  For polling, `initialize()` will await the first poll (which resolves immediately if `fetchMock` responds synchronously).

### Prefer evaluate-driven tests over explicit initialize()

Many tests on the `control` branch test that `evaluate()` triggers lazy initialization. Prefer this pattern to test the full public API path:
```typescript
const evalPromise = client.evaluate('flagA');
await vi.advanceTimersByTimeAsync(3_000);
const result = await evalPromise;
```
Only call `initialize()` explicitly when the test specifically needs to verify initialization behavior (e.g., deduplication, timing, init promise resolution).

### Assert console output from the implementation

The implementation logs warnings/errors for specific conditions. Tests must assert these:
- Stream timeout: `console.warn('@vercel/flags-core: Stream initialization timeout, falling back')`
- Stream error (e.g., 502): `console.error('@vercel/flags-core: Stream error', expect.any(Error))`
- 401 fast-fail: `console.error` with auth error (no retry, no timeout wait)

### Do not weaken assertions when adapting tests

When updating tests for new behavior, preserve the strength of existing assertions:
- Keep exact call count checks (e.g., `expect(streamCalls).toHaveLength(2)`) rather than weakening to `.toBeGreaterThanOrEqual(1)`
- Keep specific header assertions (e.g., `X-Retry-Attempt` values) rather than removing them
- Keep `errorSpy`/`warnSpy` assertions rather than dropping them

## Important Implementation Details

### Stream Connection

- Uses fetch with streaming body (NDJSON format)
- Callbacks: `onDatafile` (new data), `onPrimed` (server confirmed revision is current), `onDisconnect`
- Sends `X-Revision` header with the current revision number on every connection (including reconnects), allowing the server to respond with a lightweight `primed` message instead of a full datafile when the revision is current
- The `primed` message confirms the client's data is up-to-date; it resolves the init promise (like `datafile`) but does not update data — only transitions state to `streaming`
- Reconnects with exponential backoff (base: 1s, max: 60s, max retries: 15)
- Retries on transient errors both before and after initial data is received. Before initial data, retries continue until max retries are exhausted or the abort controller is aborted (e.g., by the Controller's init timeout). The init promise rejects when the loop exits without data.
- Default `initTimeoutMs`: 3000ms
- 401 errors abort immediately (invalid SDK key) and reject the init promise, so fallback kicks in without waiting for the stream timeout
- On disconnect: state transitions to `'degraded'`, falls back to polling if enabled
- On reconnect: Controller listens for `'connected'` event and transitions back to `'streaming'`
- Background stream promises (from init timeout) are `.catch`-ed by the Controller to prevent unhandled rejections when the stream is aborted before receiving data

### Polling

- Interval-based HTTP requests to `/v1/datafile`
- Default `intervalMs`: 30000ms (30s)
- Default `initTimeoutMs`: 3000ms (3s)
- No retries — on fetch failure, emits an error event and waits for the next interval
- Stops automatically when stream reconnects
- `PollingSource` passes its abort signal to `fetchDatafile`, so calling `stop()` aborts in-flight HTTP requests
- `fetchDatafile` accepts an optional `signal` parameter; when provided, it aborts the internal fetch controller when the external signal fires

### Data Origin Tagging

The Controller tags all data with its origin using `tagData(data, origin)` from `tagged-data.ts`. Origins map to public `metrics.source` values:
- `'stream'`, `'poll'`, `'provided'` → `'in-memory'`
- `'fetched'` → `'remote'`
- `'bundled'` → `'embedded'`

`tagData` mutates the input object in-place via `Object.assign` (callers always pass freshly-created data).

### Usage Tracking

- Batches flag read events (max 50 events, max 5s wait)
- Sends to `flags.vercel.com/v1/ingest`
- At runtime: deduplicates by request context (per-instance WeakSet in UsageTracker)
- During builds: deduplicates all reads to a single event (buildReadTracked flag in Controller), since there is no request context available
- Uses `waitUntil()` from `@vercel/functions` (wrapped in try/catch for resilience)
- On flush failure, events are re-queued for retry with a max queue size of 500 events (oldest events are dropped when exceeded)
- `flush()` directly flushes queued events even when no scheduled flush is pending, ensuring events are not lost during `shutdown()`

### Client Management

- Each client gets unique incrementing ID
- Stored in `controllerInstanceMap` in `controller-fns.ts`
- Supports multiple simultaneous clients
- Necessary as we can't pass functions to `'use cache'` wrappers

### configUpdatedAt Guard

The Controller rejects incoming data (from stream or poll) if its `configUpdatedAt` is older than or equal to the current in-memory data. This prevents stale updates from overwriting newer data. Accepts the update if either side lacks a `configUpdatedAt`.

### Evaluation Reporting

- `internalReportValue` (defined in `lib/report-value.ts`, called from `controller-fns.ts`) reports flag evaluations to the Vercel request context
- Reports are sent for all evaluations where `datafile.projectId` exists, including error cases (e.g., FLAG_NOT_FOUND)

### Evaluation Safety

- Regex comparators (`REGEX`, `NOT_REGEX`) limit input string length to 10,000 characters to prevent ReDoS
- `read()` and `getDatafile()` return new objects with spread (never mutate `this.data`)

### Debug Mode

Enable debug logging with `DEBUG=@vercel/flags-core` environment variable.

## Dependencies

- `@vercel/functions` - For `waitUntil()`
- `jose` - JWT handling
- `js-xxhash` - Hash function for consistent splits

Peer dependencies:
- `@openfeature/server-sdk` (optional) - For OpenFeature provider
- `flags` (workspace) - Type definitions
