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
├── data-source/          # Data source implementations
│   ├── flag-network-data-source.ts
│   ├── in-memory-data-source.ts
│   └── stream-connection.ts
├── openfeature.*.ts      # OpenFeature provider
├── utils/                # Utilities
│   ├── usage-tracker.ts
│   ├── sdk-keys.ts
│   └── read-bundled-definitions.ts
└── lib/                  # Internal libraries
```

## Key Concepts

### FlagsClient

Main interface for interacting with flags:

```typescript
type FlagsClient = {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getDatafile(): Promise<Datafile>;
  evaluate<T, E>(flagKey, defaultValue?, entities?): Promise<EvaluationResult<T>>;
}
```

### Evaluation Flow

1. Retrieve flag definition from datafile
2. Look up environment config
3. Check targeting rules (shortcut for immediate match)
4. Evaluate segment-based rules against entity context
5. Return fallthrough default if no match

### FlagNetworkDataSource Options

```typescript
type FlagNetworkDataSourceOptions = {
  sdkKey: string;
  datafile?: Datafile;  // Initial datafile for immediate reads
  stream?: boolean | { initTimeoutMs: number };      // default: true (3000ms)
  polling?: boolean | { intervalMs: number; initTimeoutMs: number };  // default: true (30s interval, 3s timeout)
  buildStep?: boolean;  // Override build step auto-detection
};
```

### Data Source Priority (Fallback Chain)

Behavior differs based on environment:

**Build step** (CI=1, NEXT_PHASE=phase-production-build, or `buildStep: true`):
1. **Provided datafile** - Use `options.datafile` if provided
2. **Bundled definitions** - Use `@vercel/flags-definitions`
3. **Fetch** - Last resort network fetch

**Runtime** (default, or `buildStep: false`):
1. **Stream** - Real-time updates via SSE, wait up to `initTimeoutMs`
2. **Polling** - Interval-based HTTP requests, wait up to `initTimeoutMs`
3. **Provided datafile** - Use `options.datafile` if provided
4. **Bundled definitions** - Use `@vercel/flags-definitions`

Key behaviors:
- Bundled definitions are always loaded as ultimate fallback
- All mechanisms write to in-memory state
- If in-memory state exists, serve immediately while background updates happen
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
- Conditions use enum values
- Entities accessed via arrays (e.g., `['user', 'id']`)

## Entry Points

The package has conditional exports based on environment:

- **Default**: `./dist/index.default.js` - Standard usage
- **Next.js**: `./dist/index.next-js.js` - Wraps functions with `'use cache'`
- **OpenFeature**: `./openfeature` - OpenFeature server SDK provider

## Commands

```bash
# Build
pnpm build

# Test
pnpm test

# Type check
pnpm check

# Integration tests (requires INTEGRATION_TEST_CONNECTION_STRING)
pnpm test:integration
```

## Important Implementation Details

### Stream Connection

- Uses fetch with streaming body (NDJSON format)
- Reconnects with exponential backoff (base: 1s, max: 60s, max retries: 15)
- Default `initTimeoutMs`: 3000ms
- 401 errors abort immediately (invalid SDK key)
- On disconnect: falls back to polling if enabled

### Polling

- Interval-based HTTP requests to `/v1/datafile`
- Default `intervalMs`: 30000ms (30s)
- Default `initTimeoutMs`: 10000ms (10s)
- Retries with exponential backoff (base: 500ms, max 3 retries)
- Stops automatically when stream reconnects

### Usage Tracking

- Batches flag read events (max 50 events, max 5s wait)
- Sends to `flags.vercel.com/v1/ingest`
- Deduplicates by request context
- Uses `waitUntil()` from `@vercel/functions`

### Client Management

- Each client gets unique incrementing ID
- Stored in `clientMap` for function lookups
- Supports multiple simultaneous clients
- Necessary as we can't pass function to `'use cache'` client-fns

### Debug Mode

Enable debug logging with `DEBUG=1` environment variable.

## Dependencies

- `@vercel/functions` - For `waitUntil()`
- `jose` - JWT handling
- `js-xxhash` - Hash function for consistent splits

Peer dependencies:
- `@openfeature/server-sdk` (optional) - For OpenFeature provider
- `flags` (workspace) - Type definitions
