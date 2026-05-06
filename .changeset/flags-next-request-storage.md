---
'flags': minor
---

Add `requestStorage` and `attach` to `flags/next` for passing the `Request`
into flag evaluation via `AsyncLocalStorage`.

When a request is set on `requestStorage` (directly via `requestStorage.run`
or implicitly through the `attach()` Route Handler wrapper), `flag()` reads
headers and cookies from `request.headers` and skips the dynamic
`import('next/headers')` and `headers()` / `cookies()` calls entirely.

```ts
import { attach } from 'flags/next';

export const GET = attach(async (request) => {
  const value = await someFlag();
  return Response.json({ value });
});
```
