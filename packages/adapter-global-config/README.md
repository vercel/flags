# `@flags-sdk/global-config`

## Installation

```bash
npm install @flags-sdk/global-config
```

## Usage

## Using the default adapter

This adapter will connect to the Global Config available under the `GLOBAL_CONFIG` environment variable, and read items from a key in the Global Config called `flags`.

```ts
import { flag } from "flags/next";
import { globalConfigAdapter } from "@flags-sdk/global-config";

export const exampleFlag = flag({
  key: "example-flag",
  adapter: globalConfigAdapter,
});
```

Your Global Config should look like this:

```json
{
  "flags": {
    "example-flag": true
  }
}
```

## Using a custom adapter

You can specify a custom adapter which connects to a different Global Config, and reads

```ts
import { flag } from "flags/next";
import { createGlobalConfigAdapter } from "@flags-sdk/global-config";

const globalConfigAdapter = createGlobalConfigAdapter(process.env.GLOBAL_CONFIG, {
  teamSlug: "your-team-slug",
  globalConfigItemKey: "my-flags",
});

export const exampleFlag = flag({
  key: "example-flag",
  adapter: globalConfigAdapter,
});
```

Your Global Config should look like this:

```json
{
  "my-flags": {
    "example-flag": true
  }
}
```

Supplying the custom `teamSlug` allows the adapter to generate an `origin` for your flags, which in turn allows the Flags Explorer to link to your Global Config. This is optional and does not affect runtime behavior.
