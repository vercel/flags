# Prototype internals

The application code is in `app/page.tsx`. Connection configuration is in
`flags.config.ts`. The files in this folder form a small reference implementation.

| File | Responsibility |
| --- | --- |
| `connection.ts` | Provider and connection contracts. No framework imports. |
| `vercel.ts` | Load metadata with OIDC. Evaluate with the workspace `@vercel/flags-core`. |
| `codegen.ts` | Convert a provider catalog into exact, typed module exports. |
| `generate.ts` | Read the config, load each catalog, and write `.flags/`. |
| `scope.ts` | Resolve context once per connection and request. Check returned variants. |
| `next.ts` | Give Server Components a request scope through React `cache()`. |

```text
Build / explicit sync
  flags.config.ts → provider.loadCatalog() → .flags/site.ts

Request
  await flag0()
    → Next.js request scope
    → connection.getEvaluationContext({ headers, cookies })
    → provider.evaluate(key, context)
    → @vercel/flags-core
```

Each provider implements `Provider<Context>`. The provider sets the accepted
context type. `defineConnection()` checks the application's resolver against
that type. Vercel currently uses `Record<string, unknown>` because the API does
not yet expose a context schema. The connection does not invent a schema from
targeting rules.

Each framework owns the scope lifetime. The Next.js adapter supports Server
Components. Route handlers and jobs must create and pass an explicit scope:

```ts
const scope = createScope({ headers: request.headers, cookies });
await scope.evaluate(connection, key, catalogVariants, catalogId);
```

This path requires no import resolver or ambient context. Another framework can
use this scope and replace `next.ts` with its own binding. The generator has one
Next.js-specific import for that binding.

The scope caches the context promise, including an error, for each connection.
Separate scopes cannot share a context. Flag values are not cached by the scope.
Per-call inputs and flag-level context transforms are outside this demo.

The generated variants are both the source of TypeScript inference and the
runtime check. If the provider returns a new value, evaluation throws with a
sync instruction. It also rejects a different provider project or environment.
This is a strict prototype policy. A production standard needs a version and
compatibility policy for catalog changes.

The datafile has targeting defaults, but it does not identify a separate failure
default for each flag. The demo does not treat the first variant or an anonymous
evaluation as that default. Provider errors are reported as errors.

No catalog request starts an evaluation client. The runtime creates the client
on its first evaluation and lets `@vercel/flags-core` manage data updates. This
prototype does not yet expose a provider shutdown hook for framework lifecycle
integration.
