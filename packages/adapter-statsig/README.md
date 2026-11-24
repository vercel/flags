# `@flags-sdk/statsig`

An [OpenFeature](https://openfeature.dev) server provider for [Statsig](https://statsig.com), for the [Flags SDK](https://flags-sdk.dev) v5, and `getProviderData` to load the definitions of Statsig for Flags Explorer. It supports feature gates, dynamic configs, experiments and layers.

## OpenFeature provider

`@flags-sdk/statsig/openfeature` exports `StatsigProvider`, an OpenFeature server provider for Statsig. It uses the Statsig Server Core SDK. It works with the Flags SDK v5 and with the OpenFeature SDK. It does not import `flags`.

```bash
pnpm i @flags-sdk/statsig @statsig/statsig-node-core @openfeature/server-sdk
```

```ts
'use flags';

import { StatsigProvider } from "@flags-sdk/statsig/openfeature";
import { defineSource } from "flags";

const statsig = defineSource({
  provider: new StatsigProvider(process.env.STATSIG_SERVER_API_KEY ?? ""),
  getEvaluationContext: () => ({ targetingKey: "user-1" }),
});

export const marketingGate = statsig.bindFlag("marketingGate", {
  defaultValue: false,
});
```

The flag key selects the Statsig entity:

| Key | Reads |
| --- | --- |
| `my_gate` or `gate:my_gate` | the value of a feature gate (boolean) |
| `config:my_config` | the value object of a dynamic config |
| `experiment:my_experiment` | the value object of an experiment |
| `layer:my_layer.param` | one parameter of a layer (a layer key needs a parameter) |

Add `.<param>` to read one parameter, e.g. `config:my_config.text` or `experiment:pricing.price`. String and number flags need a parameter. A missing parameter returns the default value of the flag.

The provider converts the evaluation context to a `StatsigUser`. `targetingKey` (or `userID`) becomes `userID`. `email`, `ip`, `userAgent`, `country`, `locale`, `appVersion`, `custom`, `customIDs`, `privateAttributes` and `statsigEnvironment` keep their names. Other attributes with a primitive value go to `custom`.

Options:

- `new StatsigProvider(sdkKey, { statsigOptions })` creates a `Statsig` instance with these options. Creating it does not open a connection. The provider fetches the rules in `initialize()`, and shuts the instance down in `onClose()`.
- `new StatsigProvider(statsig)` uses your `Statsig` instance. The provider initializes it, but does not shut it down.
- `disableExposureLogging: true` turns off exposure logging. Statsig logs exposures by default.

If Statsig rejects the key (401 or 403), `initialize()` throws a fatal error (`PROVIDER_FATAL`). The SDK does not try again, and the flags return their default values until the process restarts. Other errors, e.g. of the network, are tried again on the next evaluation.

`track(eventName, context, details)` calls `logEvent`. `details.value` becomes the value of the event, and the other details its metadata.

## Flags Explorer metadata

```ts
import { getProviderData } from "@flags-sdk/statsig";

const data = await getProviderData({
  // A Statsig Console API key
  consoleApiKey: process.env.STATSIG_CONSOLE_API_KEY!,
  // Optional: your Statsig project ID, for the links to the console
  projectId: process.env.STATSIG_PROJECT_ID,
});
```

`getProviderData` is also available from `@flags-sdk/statsig/provider`.

`getProviderData` returns `{ definitions, hints }`, the data which [Flags Explorer](https://vercel.com/docs/feature-flags/flags-explorer) reads from the endpoint `/.well-known/vercel/flags`. The definitions contain the description, the options and a link to the dashboard of each flag. When the request fails or an option is missing, `definitions` is empty and `hints` tells why.

`getProviderData` exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, which the Flags SDK v5 no longer creates. Flags Explorer cannot yet load this metadata from a provider itself. Until it can, an application which wants the metadata in Flags Explorer serves the result of `getProviderData` from that endpoint. After that, `getProviderData` is no longer needed.

## Upgrading from v4

The v4 adapter (`statsigAdapter`, `createStatsigAdapter`, `createDefaultStatsigAdapter`, `resetDefaultStatsigAdapter`) is removed, with the re-exports of `statsig-node-lite` (`Statsig`, `StatsigUser`, `DynamicConfig`, ...) and the Global Config data adapter of `statsig-node-vercel`. The Flags SDK v5 has no adapters: flags come from [OpenFeature providers](https://flags-sdk.dev/docs/providers/openfeature), which you give to `defineSource({ provider })`. Use `StatsigProvider` of `@flags-sdk/statsig/openfeature`, as above. It uses the Statsig Server Core SDK (`@statsig/statsig-node-core`), not `statsig-node-lite`.

`getProviderData` stays, with the same options. The package no longer depends on `flags`, `statsig-node-lite`, `statsig-node-vercel`, `@vercel/global-config` or `@vercel/functions`.
