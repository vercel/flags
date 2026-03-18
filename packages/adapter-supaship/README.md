# Flags SDK - Supaship Adapter

The Supaship adapter for the [Flags SDK](https://flags-sdk.dev/) supports server-side feature evaluation powered by [Supaship](https://supaship.com/).

## Setup

Install the adapter:

```bash
pnpm i @flags-sdk/supaship
```

## Provider Instance

Import the default adapter instance `supashipAdapter` from `@flags-sdk/supaship`:

```ts
import { supashipAdapter } from "@flags-sdk/supaship";
```

The default adapter is configured from:

```sh
export SUPASHIP_SDK_KEY="your-supaship-sdk-key"
export SUPASHIP_ENVIRONMENT="production"
```

## Example

```ts
import { dedupe, flag } from "flags/next";
import { supashipAdapter, type FeatureContext } from "@flags-sdk/supaship";

const identify = dedupe(async (): Promise<FeatureContext> => {
  return {
    userId: "user-123",
    plan: "pro",
  };
});

export const newHeader = flag<boolean, FeatureContext>({
  key: "new-header",
  defaultValue: false,
  identify,
  adapter: supashipAdapter.feature(),
});
```

## Custom Adapter

Use `createSupashipAdapter` when you need custom client configuration:

```ts
import { createSupashipAdapter } from "@flags-sdk/supaship";

const customSupashipAdapter = createSupashipAdapter({
  sdkKey: process.env.SUPASHIP_SDK_KEY!,
  environment: "staging",
  context: { app: "dashboard" },
  networkConfig: {
    requestTimeoutMs: 5000,
  },
});
```

## Notes

- This adapter uses Supaship's JavaScript SDK (`@supashiphq/javascript-sdk`) under the hood.
- Supaship supports feature values of type `boolean`, `null`, `object`, and `array`.
- If Supaship returns `null` or does not return a value, the flag `defaultValue` is used.
