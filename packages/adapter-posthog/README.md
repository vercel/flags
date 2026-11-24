# `@flags-sdk/posthog`

An [OpenFeature](https://openfeature.dev) server provider for [PostHog](https://posthog.com), for the [Flags SDK](https://flags-sdk.dev) v5, and `getProviderData` to load the flag definitions of PostHog for Flags Explorer.

## OpenFeature provider

`@flags-sdk/posthog/openfeature` exports `PostHogProvider`, an OpenFeature server provider for PostHog. It works with the Flags SDK v5 and with any other OpenFeature server SDK. It does not import `flags`.

```bash
pnpm i @flags-sdk/posthog @openfeature/server-sdk posthog-node
```

The application creates the PostHog client of `posthog-node` (5 or 6) and gives it to the provider. The provider does not open a connection itself.

```ts
import { PostHogProvider } from "@flags-sdk/posthog/openfeature";
import { defineSource } from "flags";
import { PostHog } from "posthog-node";

const posthog = defineSource({
  provider: new PostHogProvider(
    new PostHog(process.env.POSTHOG_PROJECT_API_KEY!, {
      host: process.env.POSTHOG_HOST,
      // Optional: local evaluation with a feature flags secret key
      secretKey: process.env.POSTHOG_SECRET_KEY,
    }),
  ),
  getEvaluationContext: () => ({ targetingKey: "user-123" }),
});

export const showBanner = posthog.bindFlag("showBanner", {
  defaultValue: false,
});
```

Flag types:

| Type | Value |
| --- | --- |
| `boolean` | Whether the flag is enabled for the user. |
| `string` | The variant key of a multivariate flag. An enabled boolean flag gives the error `TYPE_MISMATCH`. |
| `number` | The JSON payload of the flag. It must be a number, else the error is `TYPE_MISMATCH`. |
| `object` | The JSON payload of the flag, any JSON value. |

If the flag is off, or has no payload, the flag uses its default value. If PostHog returns no result for the flag (for example, the flag does not exist), the error is `FLAG_NOT_FOUND`. The `variant` of the resolution is the variant key, if the flag has one.

Evaluation context:

- `targetingKey` is the distinct ID. It is required: without it, the error is `TARGETING_KEY_MISSING`. The provider also accepts `distinctId`, the entity of the v4 adapter.
- `groups` (group type to group key), `personProperties` and `groupProperties` go to PostHog with the same names.
- Other top-level attributes with a string, number or boolean value are person properties. Values in `personProperties` win.

Options, the second argument of `new PostHogProvider(client, options)`:

- `onlyEvaluateLocally`, `sendFeatureFlagEvents`, `disableGeoip`: the evaluation options of `posthog-node`, for each evaluation.
- `shutdownOnClose`: call `client.shutdown()` when OpenFeature closes the provider. Defaults to `false`, because the application owns the client.

`track(eventName, context, details)` of OpenFeature calls `client.capture()` with the distinct ID, the groups and the details as the properties.

## Flags Explorer metadata

`getProviderData` returns `{ definitions, hints }`, the data which [Flags Explorer](https://vercel.com/docs/feature-flags/flags-explorer) reads from the endpoint `/.well-known/vercel/flags`. The definitions contain the description, the options and a link to the dashboard of each flag. When the request fails or an option is missing, `definitions` is empty and `hints` tells why.

`getProviderData` exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, which the Flags SDK v5 no longer creates. Flags Explorer cannot yet load this metadata from a provider itself. Until it can, an application which wants the metadata in Flags Explorer serves the result of `getProviderData` from that endpoint. After that, `getProviderData` is no longer needed.

`getProviderData` supports either a project secret API key or a personal API key.
With a personal API key, it reads the paginated management API:

```ts
import { getProviderData } from "@flags-sdk/posthog";

await getProviderData({
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
  projectId: process.env.POSTHOG_PROJECT_ID!,
});
```

To use a project-scoped key with `feature_flag:read`, select the definitions API:

```ts
await getProviderData({
  projectSecretApiKey: process.env.POSTHOG_PROJECT_SECRET_API_KEY!,
  projectId: process.env.POSTHOG_PROJECT_ID!,
});
```

Both modes read `POSTHOG_HOST` by default. `appHost` overrides the dashboard host;
project-key mode also accepts `apiHost` to override the ingestion host. The project
ID supplies dashboard links in project-key mode; authentication needs only the key.
Definitions include descriptions (`name`), boolean or multivariate options, and
payload options. Nonempty payloads take precedence over flag values.
Creation timestamps are available only from the personal-key management API.

Environment variables of `getProviderData`:

```bash
# Settings > Project > Project secret API keys (feature_flag:read scope)
POSTHOG_PROJECT_SECRET_API_KEY=phs_...
# Alternatively: Settings > User > Personal API keys (feature_flag:read scope)
# POSTHOG_PERSONAL_API_KEY=phx_...
# Settings > Project > Project ID
POSTHOG_PROJECT_ID=521742
# Regional host, the default of the API host and of the dashboard host
POSTHOG_HOST=https://us.i.posthog.com # or https://eu.i.posthog.com
```

## Upgrading from v4

The v4 adapter (`postHogAdapter`, `createPostHogAdapter`, `resetDefaultPostHogAdapter`) is removed, with the types `PostHogEntities` and `JsonType`. The Flags SDK v5 has no adapters: flags come from [OpenFeature providers](https://flags-sdk.dev/docs/providers/openfeature), which you give to `defineSource({ provider })`. Use `PostHogProvider` of `@flags-sdk/posthog/openfeature`, as above. It reads the flag value and the payload with the type of the flag: a `boolean` or `string` flag reads the value, a `number` or `object` flag reads the payload (`postHogAdapter.payload` in v4).

The provider does not read environment variables. Create the client of `posthog-node` yourself, with `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST` and, for local evaluation, `POSTHOG_SECRET_KEY`.

`getProviderData` stays, with the same options. The package no longer depends on `flags` or `posthog-node`.

## Documentation

View more PostHog documentation at [posthog.com](https://posthog.com?utm_source=github&utm_campaign=flags_sdk).
