# @flags-sdk/conformance

The conformance suite of the [Flags SDK standard](../flags/STANDARD.md). It
checks a framework binding in a running application over HTTP, so a
framework can show that it works with the Flags SDK.

## Features

- **Over HTTP.** It tests the real framework, with real requests.
- **For each runner.** `conformanceChecks` is a list, so Playwright, Vitest
  or any other runner can make one test of each check.
- **Clear errors.** A failed check tells which part of the standard is not
  met.

## Installation

```sh
pnpm add -D @flags-sdk/conformance
```

## Setup

### 1️⃣ Add the route

The application serves `GET /conformance` with the result of the suite:

```ts
// e.g. app/conformance/route.ts in Next.js
import {
  conformanceResult,
  setConformanceSignal,
} from '@flags-sdk/conformance';
import { redirect } from 'next/navigation';

// Only for frameworks with signals: a signal with the status 307
setConformanceSignal(() => redirect('/'));

export async function GET() {
  return Response.json(await conformanceResult());
}
```

### 2️⃣ Run the checks

```ts
// e2e/conformance.spec.ts (Playwright)
import { conformanceChecks } from '@flags-sdk/conformance';
import { test } from '@playwright/test';

for (const check of conformanceChecks) {
  test(check.name, async ({ baseURL }) => {
    const options = {
      baseURL: baseURL as string,
      flagsSecret: process.env.FLAGS_SECRET,
      signal: true,
      manifestFile: '.next/flags-manifest.json',
    };
    test.skip(!check.applies(options), 'Does not apply');
    await check.run(options);
  });
}
```

`runConformance(options)` runs all checks without a test runner.

## The checks

| Check | Section of the standard | When |
| --- | --- | --- |
| The headers, the cookies and the URL of the request | 3.1 | always; the URL only with `url` not `false` |
| The evaluation context one time for each request | 3.2 | always |
| The requests apart | 3.2 | always |
| A signal of the framework | 5.2 | with `signal: true` |
| An override cookie | 10.1 | with `flagsSecret` |
| The manifest in development | 7.2 | with `devManifest: true` |
| The manifest in the build | 7.2, 7.3 | with `manifestFile` |

## Options

| Option | Meaning |
| --- | --- |
| `baseURL` | The origin of the running application |
| `path` | The path of the route. The default is `/conformance` |
| `flagsSecret` | `FLAGS_SECRET` of the application, for the override cookie |
| `signal` | Whether the application registered a signal with `setConformanceSignal` |
| `devManifest` | Whether the application runs in development |
| `manifestFile` | The file of the manifest of the build |
| `url` | `false` if the binding does not know the URL in all places, e.g. Next.js |
| `fetch` | An other `fetch`, e.g. for a test without a server |

## How it works

- The suite has its own connection. Its provider returns the evaluation
  context which it receives, so the suite sees exactly what the binding
  gives the SDK.
- The route evaluates the flags of the suite two times. The connection
  counts how often it creates the evaluation context for each request.
- The suite sends a header with an ID with each request, to count for each
  request. Thus, the checks can run at the same time.

## Examples

Each app in `tests/standard` runs the suite: Next.js, SvelteKit, Nuxt,
TanStack Start, Hono and Express.

## License

MIT
