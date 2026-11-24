# `@flags-sdk/global-config`

An [OpenFeature](https://openfeature.dev) server provider for [Global Config](https://vercel.com/docs/global-config) (formerly Edge Config), for the [Flags SDK](https://flags-sdk.dev) v5.

The flags are the entries of one item of a Global Config store, by default the item `flags`:

```json
{
  "flags": {
    "summerSale": true,
    "banner": "Free shipping"
  }
}
```

## Installation

```bash
npm install flags @flags-sdk/global-config
```

The provider imports only types of `@openfeature/server-sdk`, so you do not need to install it. With `"skipLibCheck": false` in `tsconfig.json`, install it as a dev dependency for its types.

## Usage

Create a source with the provider, and declare the flags on it:

```ts title="flags.ts"
'use flags';

import { GlobalConfigProvider } from '@flags-sdk/global-config/openfeature';
import { defineSource } from 'flags';

const globalConfig = defineSource({
  provider: new GlobalConfigProvider(),
});

export const summerSale = globalConfig.bindFlag('summerSale', {
  defaultValue: false,
});

export const banner = globalConfig.bindFlag('banner', {
  type: 'string',
  defaultValue: '',
});
```

```ts
const sale = await summerSale();
```

With the file system API, export the provider from `flags/sources/<source>/provider.ts`:

```ts title="flags/sources/config/provider.ts"
import { GlobalConfigProvider } from '@flags-sdk/global-config/openfeature';

export default new GlobalConfigProvider();
```

### Options

| Option    | Default                                       | Meaning                                                  |
| --------- | --------------------------------------------- | -------------------------------------------------------- |
| `client`  | The environment variable `GLOBAL_CONFIG`, then `EDGE_CONFIG` | A client of `@vercel/global-config`, or a connection string. |
| `itemKey` | `flags`                                       | The item of the store which contains the flags.          |

```ts
import { createClient } from '@vercel/global-config';

new GlobalConfigProvider({
  client: createClient(process.env.OTHER_GLOBAL_CONFIG),
  itemKey: 'my-flags',
});
```

## Behavior

- **No connection at import.** The provider creates the client on the first evaluation. A tool can import the source, e.g. to write the manifest of the flags, without the environment variable.
- **One read for all flags.** Flags that evaluate at the same time share one read of the item.
- **The same value for everybody.** A value of Global Config does not depend on the visitor, so the reason is `STATIC`, and the source needs no evaluation context.
- **Errors return the default value:**
  - `FLAG_NOT_FOUND` when the item has no entry for the flag;
  - `TYPE_MISMATCH` when the value has a different type than the flag;
  - `GENERAL` when the item is missing or the read fails.

## Upgrading from v4

The v4 adapter (`globalConfigAdapter`, `createGlobalConfigAdapter`) is removed. Use the provider with a source, as above. The option `globalConfigItemKey` is now `itemKey`. The `teamSlug` option is not needed.
