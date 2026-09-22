# Cache read boundary

`DatafileCache` owns one tagged snapshot and its internal network arrival time.
It does not inspect headers, retain a mutable freshness flag, or perform I/O.
`read()` consumes evidence and returns a decision; the caller owns fetching.

```ts
const snapshot = cache.peek();
const assessment = headerCheck.check(snapshot);
const result = cache.read(assessment, {
  staleWhileRevalidateMs,
  staleIfErrorMs,
  error: refreshError,
});
```

The header checker in this example is a future integration for PR #498, not part
of this change. Its assessment includes the exact `snapshot` token it checked,
`needsRefresh`, and an optional `confirmedAt`. Tokens change on every cache write,
even when callers reuse the same data object. An old assessment cannot confirm a
replacement entry or suppress its refresh.

| Header evidence | Future checker's assessment |
| --- | --- |
| Matches cached version, with no newer version observed | `needsRefresh: false`; advance that version's `confirmedAt` |
| Newer than cached version | `needsRefresh: true`; preserve the previous confirmation time |
| Older matching header after a newer observation | Keep the known invalidation and previous confirmation time |
| Missing or malformed | No new evidence; preserve existing cached-read behavior and confirmation time |

The checker owns `highestObserved` and `lastSeen`, scoped to project/environment
and version. Header observations never become fields on the datafile.

For a matching assessment, the cache derives:

```ts
const freshAt = Math.max(cached.fetchedAt ?? -Infinity, confirmedAt ?? -Infinity);
```

An empty cache returns `blocking`. A current assessment with `needsRefresh: false`
returns the snapshot without applying an age limit. When refresh is needed, the
cache uses `staleWhileRevalidateMs` to choose `background` with the snapshot or
`blocking` without it. After an error, `staleIfErrorMs` controls stale eligibility;
expiry throws that error without discarding storage. Zero disables stale serving,
and a positive window includes its exact deadline. Fetching, request sharing,
header parsing, and applying refresh results remain with the future integration.

Today the controller supplies stream/poll health instead: no failure means fresh.
The first failure freezes confirmation for the snapshot that was being served;
repeated errors cannot move that time. Accepted data, matching equal-version data,
or a matching stream `primed` message restores health. Existing sources continue
their normal updates/retries; read decisions do not add network requests. Internal
fetch time is recorded for network snapshots only; loading a seed does not create
freshness evidence. Public `fetchedAt` and build embedding are left to PR #498.
