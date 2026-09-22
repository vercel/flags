# Runtime cache freshness

The controller applies the same policy to `evaluate()`, `bulkEvaluate()` and
`getDatafile()`, including provided and bundled fallback definitions.

```ts
createClient(sdkKey, {
  staleWhileRevalidateMs: 10_000, // default; milliseconds
  staleIfErrorMs: Infinity, // default; additional milliseconds after SWR
});
```

`staleWhileRevalidateMs` must be finite and non-negative; zero disables background
stale serving. `staleIfErrorMs` accepts non-negative finite numbers or `Infinity`.
A finite error window extends SWR: with the values `10_000` and `20_000`, stale
fallback is eligible through 30 seconds after the last evidence of freshness.
Boundaries are inclusive; two zero windows allow no stale fallback.

`Infinity` preserves last-known definitions even when their age is unknown.
Finite windows require evidence: a valid persisted `fetchedAt`, an accepted
network arrival, an unchanged successful poll, or a matching version header.
Loading or serializing definitions never renews their timestamp. Poll and header
confirmations are held separately from the public `fetchedAt` arrival timestamp.

When no eligible definitions remain, evaluation returns a supplied default with
reason `error`, or throws without a default. Bulk evaluation returns defaults
when every requested flag has one; otherwise it throws. `getDatafile()` throws.
`getFallbackDatafile()` remains an explicit read of the raw bundled artifact.
Build mode and disabling both streaming and polling keep static caches.

## Sources and recovery

On Vercel (`vercel: true`, default when `VERCEL=1`), initialization retains
provided data or loads the bundle before selecting header mode. It does not
start streams or polling, even if the cache is empty. Reads capture their request
header and share a fetch when empty or behind the required version. Within SWR,
reads return immediately and register one handled background promise with
`waitUntil`; outside SWR, reads await the shared fetch.

Each blocking read checks its own version requirement against the accepted
cache. Equal, older or invalid header responses cannot replace data or renew its
age. A response behind a request's requirement is a refresh failure: the read
uses eligible stale-if-error data or defaults/throws. There is no automatic
catch-up or retry loop; a subsequent request can try again. This also applies
when a newer header arrives during another request's fetch.

Matching headers confirm freshness only at the highest observed version.
Missing, malformed and older headers supply no new evidence. With cached data
they cause no fetch: the source is unavailable, and finite windows still expire.
An empty cache can fetch without a header. An accepted newer response can renew
freshness even if another request already requires a later version.

Outside Vercel mode, streaming takes precedence over polling. A stream connection confirmed by an accepted update, an unchanged version or a
primed message keeps data fresh indefinitely; disconnect starts its stale period. Reconnection
continues in the existing stream transport. Disconnected reads serve SWR or
eligible error fallback immediately; they do not wait for reconnection. A
confirmed connection restores fresh reads.

Polling runs on its existing interval, including after initialization failure.
Within SWR, reads use cache while scheduled updates continue. Outside SWR, reads
share a poll and apply error fallback if it fails or returns an older version.
An unchanged successful poll confirms freshness without replacing definitions
or `fetchedAt`. Unknown-age fallback after a failed initial poll waits for the
scheduled poll to recover instead of repeating initialization on every read.

Shutdown aborts in-flight sources and prevents late arrivals from updating data
or completing reads with stale fallback. Cancellation still depends on the
transport settling; this change adds no retry, backoff or deadline machinery.
