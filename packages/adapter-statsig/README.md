# Flags SDK — Statsig Provider

The [Statsig provider](https://flags-sdk.dev/docs/api-reference/adapters/statsig) for the [Flags SDK](https://flags-sdk.dev/) contains support for Statsig's Feature Gates, Dynamic Config, Experiments, Autotune and Layers.

## Setup

The Statsig provider is available in the `@flags-sdk/statsig` module. You can install it with

```bash
pnpm i @flags-sdk/statsig
```

## Provider Instance

You can import the default adapter instance `statigAdapter` from `@flags-sdk/statsig`:

```ts
import { statsigAdapter } from "@flags-sdk/statsig";
```

## Example

```ts
import { flag } from "flags/next";
import { statsigAdapter } from "@flags-sdk/statsig";

export const marketingGate = flag<boolean>({
  key: "marketing_gate",
  adapter: statsigAdapter.featureGate((config) => config.value),
});
```

## OpenFeature provider

`@flags-sdk/statsig/openfeature` exports `StatsigProvider`, an OpenFeature server provider for Statsig. It uses the Statsig Server Core SDK. It works with the Flags SDK v5 and with the OpenFeature SDK. It does not import `flags`.

```bash
pnpm i @flags-sdk/statsig @statsig/statsig-node-core @openfeature/server-sdk
```

```ts
'use flags';

import { StatsigProvider } from "@flags-sdk/statsig/openfeature";
import { bindFlag, defineSource } from "flags";

const statsig = defineSource({
  provider: new StatsigProvider(process.env.STATSIG_SERVER_API_KEY ?? ""),
  getEvaluationContext: () => ({ targetingKey: "user-1" }),
});

export const marketingGate = bindFlag({
  key: "marketing_gate",
  source: statsig,
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

`track(eventName, context, details)` calls `logEvent`. `details.value` becomes the value of the event, and the other details its metadata.

## Documentation

Please check out the [Statsig provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/statsig) for more information.
