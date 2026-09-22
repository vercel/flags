# Cache ownership and extension boundary

The controller owns one `DatafileCache` containing the current tagged datafile.
Sources obtain data and report outcomes. The controller selects the mode and source
origin, and forwards data and evidence. The cache applies version acceptance, tags
accepted updates, stores the entry, records the first consecutive failure, and
decides whether it may be served.

```mermaid
flowchart LR
    E[Evaluation] --> C
    S[Sources] -->|Data and outcomes| C
    H[Future header check] -->|Request assessment| C
    subgraph Controller
        C[Coordination] <--> K[DatafileCache]
    end
```

## This PR: storage and polling stale-if-error

All modes use the same storage. Polling is the only mode with new serving policy:

1. `onPollData` calls `updateFromSource(data, 'poll')`. The cache applies the existing
   version predicate, tags and stores accepted data, and clears failure. If the
   response is not accepted as a replacement, `tryConfirm(response)` checks whether
   it confirms the current version without replacing or retagging the entry.
2. `onPollError` calls `fail()`, retaining the first consecutive error and time.
3. Runtime polling evaluations use `read(staleIfErrorMs)` at the shared controller
   read boundary. The cache enforces the allowance and retains expired data.
4. A valid confirmation clears the failure; a later error starts a new allowance.

`seed()` stores initial or fallback snapshots; `clear()` removes storage. Neither
operation erases an outage or renews its deadline. Seeds include provided/bundled
restoration, build data, and snapshot/offline fallback loads. These writes preserve
the existing storage behavior and are separate from live source updates.

`updateFromSource()` owns version acceptance and recovery in one operation. It
preserves the existing acceptance rules, including missing or unparseable versions.
`tryConfirm()` requires equal finite versions and matching project/environment,
so an older response cannot clear a newer cached version's failure. Object identity
alone is not freshness evidence. No separate mutable `isFresh` flag is needed.

Both stream and poll data callbacks use `updateFromSource()`. The controller passes
the origin, and the cache calls the existing `tagData()` only after acceptance.
Rejected and same-version responses leave the stored reference and origin unchanged.
Stream disconnect/primed integration and stream serving policy remain deferred.

There is no age-based expiry between successful polls and no read-triggered poll.
Positive finite SIE windows include the exact deadline; zero disables fallback
immediately after an error, and the default `Infinity` preserves unlimited fallback.
Initialization timeout alone is not failure evidence. Existing source startup,
fetching, scheduling, retries, and cancellation remain unchanged. `getDatafile()`
continues to return snapshots independently of the evaluation allowance.

## Future source integrations

| Mode | Evidence that confirms freshness | When updates are unavailable |
| --- | --- | --- |
| Polling — this PR | Accepted poll data or a valid same-version/project/environment response | Existing error events start SIE; polling continues normally |
| Streaming — later | Accepted stream data or a `primed` message matching the cached revision and identity; opening a connection alone is insufficient | Disconnect evidence can activate SIE while existing stream code reconnects |
| Headers — later | A request assessment describes whether this cached version satisfies the required version | Newer versions require SWR/blocking policy; failed refreshes may use SIE |

Streaming policy and header integration are follow-up work. This PR does not wire
stream failures into the cache, add refresh orchestration, or record fetch-age
metadata. The following is the intended header boundary for PR #498, not an API
implemented by this PR:

```ts
const snapshot = cache.peek();
const assessment = headerCheck.check(snapshot);
const decision = cache.read(assessment); // Future request-aware policy overload.
// The controller/source performs any background or blocking refresh.
```

Header parsing, `highestObserved`, and `lastSeen` belong to the header checker,
scoped to project/environment and version. The assessment must carry the snapshot
it describes, `needsRefresh`, and `confirmedAt` as separate facts:

- A matching header can confirm that version only if no newer version was observed.
- A newer required version requests refresh without moving the previous confirmation.
- Missing/malformed headers add no evidence and preserve cached-read behavior.
- An older request must not clear global failure or invalidation state. Its read
  assessment must remain tied to the request and cached entry it checked.

The future policy can combine an entry's fetch time and applicable confirmation:
`freshAt = Math.max(cached.fetchedAt ?? -Infinity, confirmedAt ?? -Infinity)`.
An empty cache requires a blocking fetch. A newer required version uses that age
to choose background stale serving or a blocking refresh; a refresh error then
uses SIE. Unknown-age invalidated seeds require a blocking refresh. Fetching and
request sharing stay outside the cache, and an old assessment cannot renew a
replacement entry. This extension does not require a second datafile store.
