# `@flags-sdk/edge-config`

## Installation

```bash
npm install @flags-sdk/edge-config
```

## Usage

## Using the default adapter

This adapter will connect to the Edge Config available under the `EDGE_CONFIG` environment variable, and read items from a key in the Edge Config called `flags`.

```ts
import { flag } from '@vercel/flags/next';
import { edgeConfigAdapter } from '@flags-sdk/edge-config';

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: edgeConfigAdapter(),
});
```

Your Edge Config should look like this:

```json
{
  "flags": {
    "example-flag": true
  }
}
```

## Using a custom adapter

You can specify a custom adapter which connects to a different Edge Config, and reads

```ts
import { flag } from '@vercel/flags/next';
import { createEdgeConfigAdapter } from '@flags-sdk/edge-config';

const edgeConfigAdapter = createEdgeConfigAdapter(process.env.EDGE_CONFIG, {
  teamSlug: 'your-team-slug',
  edgeConfigItemKey: 'my-flags',
});

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: edgeConfigAdapter(),
});
```

Your Edge Config should look like this:

```json
{
  "my-flags": {
    "example-flag": true
  }
}
```

Supplying the custom `teamSlug` allows the adapter to generate an `origin` for your flags, which in turn allows the Flags Explorer to link to your Edge Config. This is optional and does not affect runtime behavior.
