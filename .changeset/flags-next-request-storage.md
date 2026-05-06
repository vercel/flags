---
'flags': minor
---

Add `requestStorage` and `attach` to `flags/next` for passing the request
into flag evaluation via `AsyncLocalStorage`. Works with both App Router
Route Handlers (Web `Request`) and Pages Router API Routes (Node
`IncomingMessage`).

When a request is set on `requestStorage` (directly via `requestStorage.run`
or implicitly through the `attach()` wrapper), `flag()` reads headers and
cookies from the request and skips the dynamic `import('next/headers')` and
`headers()` / `cookies()` calls entirely.

```ts
// App Router Route Handler
import { attach } from 'flags/next';

export const GET = attach(async (request) => {
  const value = await someFlag();
  return Response.json({ value });
});

// Pages Router API Route
import { attach } from 'flags/next';

export default attach(async (req, res) => {
  const value = await someFlag();
  res.json({ value });
});
```
