# Flags SDK + TanStack Start example

A minimal [TanStack Start](https://tanstack.com/start/latest) app showing how to
use the Flags SDK through the `flags/tanstack-start` entrypoint.

## What it demonstrates

- **`src/flags.ts`** — declaring flags with `flag()` from `flags/tanstack-start`,
  including a cookie-driven boolean flag and two precomputed A/B flags with an
  `identify` function.
- **`src/routes/dashboard.tsx`** — evaluating a flag inside a route loader. Flags
  run on the server, so the evaluation is wrapped in a `createServerFn()` server
  function (this keeps it working during client-side navigation too).
- **`src/routes/marketing.tsx` + `marketing.$code.tsx`** — precomputing flags into
  a short, signed code that is encoded into the URL, then reading the values back
  cheaply with `flag(code, marketingFlags)`.
- **`src/routes/[.]well-known/vercel/flags.ts`** — the flags discovery endpoint for
  the Vercel Toolbar, built with `createFlagsDiscoveryEndpoint`.

## Running it

```sh
pnpm install
pnpm dev
```

Then open http://localhost:3000.

## Setup notes

A `FLAGS_SECRET` is required. One is provided in `.env` for local development —
generate your own for real deployments:

```sh
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

### Evaluating flags

Inside a route loader, server function, or server route you can call a flag with
no arguments — the request is resolved automatically via TanStack Start's
`getRequest()`:

```ts
const value = await showNewDashboard();
```

You can also pass a `Request` explicitly when evaluating outside of a request
context:

```ts
const value = await showNewDashboard(request);
```
