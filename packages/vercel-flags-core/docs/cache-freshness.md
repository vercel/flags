# Cached data during outages

The controller keeps the last accepted definitions and one `unhealthySince`
timestamp. The first source failure or stream disconnect starts the grace period.
Repeated failures do not move that timestamp. Successful updates or confirmations
clear it, so the next outage gets a new grace period.

```ts
createClient(sdkKey, {
  staleIfErrorMs: 30_000, // serve cached data for 30 seconds after failure
});
```

`staleIfErrorMs` defaults to `Infinity`, preserving unlimited cached fallback.
It accepts non-negative milliseconds or `Infinity`. A finite grace period includes
its end boundary; zero disables error fallback immediately. It does not depend
on the age of the last datafile or add the stale-while-revalidate duration.

For example, a stream can remain healthy all day without receiving new
configuration. If it disconnects at 15:00:00 with a 30-second grace period, cached
data remains eligible through 15:00:30. Further disconnects or failed updates do
not extend that deadline. A successful update or confirmation ends the outage.

`evaluate()`, `bulkEvaluate()` and `getDatafile()` use this same eligibility check.
After grace expires, evaluation returns a supplied default with reason `error`,
or throws without a default. Bulk evaluation returns defaults when every requested
flag has one; otherwise it throws. `getDatafile()` throws. A client without any
cached definitions cannot use the grace period.

Provided and bundled definitions are eligible during the grace period even if
initialization fails and they have no `fetchedAt`. The persisted timestamp remains
available but does not control outage fallback. Healthy data does not expire just
because it is old. Build mode and disabling both stream and polling keep their
existing static behavior. `getFallbackDatafile()` still reads the raw bundle.

## Updates and recovery

Streaming and polling keep their existing background updates. Reads serve the
cache without starting extra polls or waiting for stream reconnection. A failed
initial connection or initialization timeout starts the same grace period.
Polling continues on its interval after initialization failure.

Accepted stream or poll updates, unchanged successful stream/poll confirmations,
and stream `primed` messages clear the outage. An unchanged version preserves the
existing definitions and `fetchedAt`. Regressed responses cannot clear an outage.

On Vercel, header revalidation retains `staleWhileRevalidateMs` (default `10_000`
milliseconds). Its window is measured from the last accepted fetch or matching
header observation. Within that window, a newer header can trigger a shared
background refresh; otherwise reads block on the shared fetch. This option is
independent of `staleIfErrorMs` and does not apply to streaming or polling reads.
An expired outage grace period prevents background stale serving too.

A failed header fetch starts the outage clock when it fails, including failures
in the background. Each blocking read validates its own required version against
the accepted cache. A response behind that requirement is a refresh failure,
with no automatic retry loop; a later request can retry. A read whose requirement
is satisfied can finish independently of a concurrent reader's failure.

Accepted newer fetches and matching headers at the highest observed version clear
the outage. Equal or older fetch responses do not. Missing, malformed or older
headers do not start a new outage or clear an existing one. With cached data they
cause no fetch; an empty cache can fetch without a header.

Shutdown aborts in-flight sources and prevents late arrivals from updating data
or completing reads with cached fallback. Cancellation still depends on the
transport settling; the controller adds no retry, backoff or deadline machinery.
