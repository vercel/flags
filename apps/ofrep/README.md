# OFREP

A public HTTP service for Vercel Flags. It implements the two required endpoints
in the [OFREP 0.4.0 specification](https://github.com/open-feature/protocol/blob/main/service/openapi.yaml).
Each request selects its project and environment through the caller's credentials.
One deployment can serve multiple Vercel Flags projects.

| Method | Path | Function |
| --- | --- | --- |
| POST | `/ofrep/v1/evaluate/flags/{key}` | Evaluate one flag |
| POST | `/ofrep/v1/evaluate/flags` | Evaluate all flags |
| OPTIONS | Both paths | Browser CORS preflight |

## Run

From the repository root:

```sh
pnpm install
pnpm exec turbo dev --filter=ofrep
```

The app listens on port 3031. For a production build:

```sh
pnpm exec turbo build --filter=ofrep
pnpm --filter ofrep start
```

For Vercel, select `apps/ofrep` as the project root. Keep access to workspace
packages enabled. The app uses the Node.js runtime. It needs no project-specific
environment variables and makes no authenticated requests during the build.

## Authentication

Send a Vercel Flags SDK key or a Vercel OIDC token in `Authorization: Bearer <token>`.
Alternatively, send the credential in `X-API-Key`. Do not send different credentials
in both headers. Use a raw SDK key, not a `flags:` connection string.

The app forwards the credential to `https://flags.vercel.com/v1/datafile`. That
service validates the token and selects the project and environment. The app does
not use its deployment's OIDC token or `FLAGS` environment variable. An arbitrary
identity provider's OIDC token does not grant access to Vercel Flags.

For permitted cross-project access with Vercel OIDC, also send
`X-Vercel-Flags-Project-Id: prj_...`. The app forwards this header. The data service
checks whether the caller can access that source project. Live OIDC acceptance
depends on the data service and the caller's project configuration.

Browser CORS is enabled without cookies. Use only credentials intended for browser
exposure in browser applications. A server SDK key or OIDC token must stay on the
server. Upstream permission checks also apply to client SDK keys.

## Requests and responses

```sh
curl http://localhost:3031/ofrep/v1/evaluate/flags/banner \
  -H "Authorization: Bearer $FLAGS_SDK_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"context":{"targetingKey":"user-123","user":{"id":"user-123","plan":"pro"}}}'
```

The JSON body must contain a `context` object. An empty object is permitted.
`targetingKey`, when present, must be a string. The app passes context directly to
`@vercel/flags-core` as `entities`, as the existing Vercel OpenFeature provider does.
For rules that use `user.id`, send `context.user.id`. The app does not copy
`targetingKey` into `user.id`. Rules can use `targetingKey` directly.

Evaluation uses the datafile's environment, definitions, and segments. Success
responses contain `key`, `value`, `reason`, and `variant` when available.

| Core result | OFREP reason |
| --- | --- |
| Paused flag | `DISABLED` |
| Split, rollout, or experiment outcome | `SPLIT` |
| Target or rule match with a fixed outcome | `TARGETING_MATCH` |
| Fallthrough with a fixed outcome | `UNKNOWN` |

OFREP 0.4.0 excludes `DEFAULT` from success reasons. Its value schemas permit
booleans, strings, numbers, and objects. A top-level array or `null` produces a
`GENERAL` flag error. Arrays and nulls inside an object are permitted. The core
does not produce the optional OFREP code-default result, so this app does not
synthesize it.

Missing flags return HTTP 404 with `FLAG_NOT_FOUND`. Invalid JSON and context
return HTTP 400 with `PARSE_ERROR` or `INVALID_CONTEXT`. Single-flag evaluation
failures return HTTP 500. Bulk evaluation keeps individual `GENERAL` failures
in the `flags` array and returns HTTP 200. Upstream 401, 403, and 429 statuses pass
through; 429 responses retain `Retry-After`. Other upstream errors return HTTP 500
with a generic message. Raw upstream errors and tokens are not returned or logged.

Bulk responses include an ETag calculated from the full evaluated response. A
matching `If-None-Match` returns HTTP 304 without a body, as OFREP specifies for
this POST endpoint. A context change that changes a result changes the ETag.
Authentication is checked before conditional responses. Optional change-event
query parameters force a fresh datafile read. This app does not advertise an
optional event stream; clients use polling.

## Cache and limits

The in-memory LRU cache holds successful datafiles for five seconds. Entries are
separated by an HMAC-SHA-256 digest of the exact credential and source project
header. Each cache instance uses its own random secret, which stays in memory.
The cache does not retain raw credentials. Concurrent requests with the same
credentials share one datafile fetch. Each process has its own cache.

For JWTs with an `exp` claim, the cache lifetime cannot exceed that expiry. Reading
this claim does not validate the JWT; the data service validates it on cache
misses. Permission changes and SDK key revocation can take up to five seconds to
take effect. Expired entries are not used after an upstream failure.

Limits per process: 64 cached datafiles, 64 concurrent datafile fetches, 2 MiB per
datafile, 64 KiB per request body, and a 10-second upstream deadline. Configure
deployment-level rate limits for public traffic. Evaluation telemetry and
experiment exposure reporting are not emitted by the pure core evaluator.

## Checks

```sh
pnpm exec turbo test type-check check build --filter=ofrep
```

Tests cover evaluation, protocol errors, authentication forwarding, cache
isolation and expiry, ETags, CORS, and the official OpenFeature OFREP server
provider. Tests use a local data service substitute. Live credentials are not
required.
