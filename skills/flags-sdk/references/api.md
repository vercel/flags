# API Reference

## Table of Contents

- [flags (core)](#flags-core)
- [flags/react](#flagsreact)
- [flags/next](#flagsnext)
- [flags/sveltekit](#flagssveltekit)

---

## flags (core)

### `verifyAccess`

Verify access to the flags discovery endpoint. Returns `Promise<boolean>`.

| Parameter       | Type     | Description              |
| --------------- | -------- | ------------------------ |
| `authorization` | `string` | Authorization token      |

```ts
import { verifyAccess } from 'flags';

const access = await verifyAccess(request.headers.get('Authorization'));
if (!access) return NextResponse.json(null, { status: 401 });
```

### `mergeProviderData`

Merge provider data from multiple sources for the Flags Explorer.

| Parameter | Type                                        | Description           |
| --------- | ------------------------------------------- | --------------------- |
| `data`    | `(ProviderData \| Promise<ProviderData>)[]` | Provider data to merge|

```ts
import { mergeProviderData } from 'flags';

return mergeProviderData([
  getProviderData(flags),
  getStatsigProviderData({ /* ... */ }),
]);
```

### `reportValue`

Report flag value to Vercel for Runtime Logs and Web Analytics.

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `key`     | `string` | Flag key        |
| `value`   | `any`    | Resolved value  |

```ts
import { reportValue } from 'flags';
reportValue('summer-sale', true);
```

### Encryption Functions

All default to `process.env.FLAGS_SECRET`.

| Function                 | Input Type           | Purpose                    |
| ------------------------ | -------------------- | -------------------------- |
| `encryptFlagValues`      | `FlagValuesType`     | Encrypt resolved values    |
| `decryptFlagValues`      | `string`             | Decrypt values             |
| `encryptFlagDefinitions` | `FlagDefinitionsType`| Encrypt definitions        |
| `decryptFlagDefinitions` | `string`             | Decrypt definitions        |
| `encryptOverrides`       | `FlagOverridesType`  | Encrypt toolbar overrides  |
| `decryptOverrides`       | `string`             | Decrypt overrides          |

Optional `secret` and `expirationTime` (default `'1y'`) params on encrypt functions.

### `verifyAccessProof`

Verify an access proof token. Returns `Promise<boolean>`.

### `safeJsonStringify`

XSS-safe `JSON.stringify`. Escapes `<` and other dangerous chars.

```ts
import { safeJsonStringify } from 'flags';
safeJsonStringify({ markup: '<html></html>' });
// '{"markup":"\\u003chtml>\\u003c/html>"}'
```

---

## flags/react

### `FlagValues`

Renders a `<script data-flag-values>` tag for the Flags Explorer.

| Prop     | Type             | Description  |
| -------- | ---------------- | ------------ |
| `values` | `FlagValuesType` | Flag values  |

```tsx
import { FlagValues } from 'flags/react';
<FlagValues values={{ myFlag: true }} />
```

For confidential flags, encrypt first:

```tsx
import { encryptFlagValues } from 'flags';
import { FlagValues } from 'flags/react';

async function ConfidentialFlags({ values }) {
  const encrypted = await encryptFlagValues(values);
  return <FlagValues values={encrypted} />;
}
```

### `FlagDefinitions`

Renders a `<script data-flag-definitions>` tag with flag metadata.

| Prop          | Type                  | Description       |
| ------------- | --------------------- | ----------------- |
| `definitions` | `FlagDefinitionsType` | Flag definitions  |

```tsx
import { FlagDefinitions } from 'flags/react';

<FlagDefinitions definitions={{
  myFlag: {
    options: [{ value: false }, { value: true }],
    origin: 'https://example.com/flag/myFlag',
    description: 'Example flag',
  },
}} />
```

---

## flags/next

### `flag`

Declare a feature flag for Next.js.

| Parameter      | Type                               | Description                        |
| -------------- | ---------------------------------- | ---------------------------------- |
| `key`          | `string`                           | Flag identifier                    |
| `decide`       | `function`                         | Resolves the flag value            |
| `defaultValue` | `any`                              | Fallback value                     |
| `description`  | `string`                           | Shown in Flags Explorer            |
| `origin`       | `string`                           | URL to manage flag                 |
| `options`      | `{ label?: string, value: any }[]` | Possible values                    |
| `adapter`      | `Adapter`                          | Provider adapter                   |
| `identify`     | `function`                         | Returns evaluation context         |

### `createFlagsDiscoveryEndpoint`

Creates an App Router route handler for `/.well-known/vercel/flags`. Auto-verifies access and adds version header.

| Parameter        | Type       | Description                    |
| ---------------- | ---------- | ------------------------------ |
| `getApiData`     | `Function` | Returns flag metadata          |
| `options.secret` | `string`   | Defaults to `FLAGS_SECRET`     |

### `getProviderData`

Turn `flag()` declarations into Flags Explorer-compatible definitions.

| Parameter | Type                   | Description     |
| --------- | ---------------------- | --------------- |
| `flags`   | `Record<string, Flag>` | Your flags      |

### `precompute`

Evaluate multiple flags, return encoded string.

| Parameter | Type         | Description |
| --------- | ------------ | ----------- |
| `flags`   | `function[]` | Flag group  |

### `evaluate`

Evaluate multiple flags, return their values as array.

### `serialize`

Turn evaluated flags into serialized representation.

| Parameter | Type         | Description      |
| --------- | ------------ | ---------------- |
| `flags`   | `function[]` | Flags            |
| `values`  | `unknown[]`  | Resolved values  |
| `secret`  | `string`     | Signing secret   |

### `getPrecomputed`

Retrieve flag values from precomputation code.

| Parameter         | Type                     | Description              |
| ----------------- | ------------------------ | ------------------------ |
| `flag`            | `function \| function[]` | Flag(s) to extract       |
| `precomputeFlags` | `function[]`             | Group used in precompute |
| `code`            | `string`                 | Precomputation code      |

### `deserialize`

Retrieve all flag values as a record from code.

### `generatePermutations`

Generate all possible precomputation codes for flag options.

| Parameter | Type         | Description                          |
| --------- | ------------ | ------------------------------------ |
| `flags`   | `function[]` | Flags with options declared          |
| `filter`  | `function`   | Optional filter for permutations     |
| `secret`  | `string`     | Defaults to `FLAGS_SECRET`           |

### `dedupe`

Deduplicate function calls per request.

| Parameter | Type       | Description            |
| --------- | ---------- | ---------------------- |
| `fn`      | `function` | Function to dedupe     |

Not available in Pages Router.

---

## flags/sveltekit

### `flag`

Declare a feature flag for SvelteKit.

| Parameter     | Type                               | Description                   |
| ------------- | ---------------------------------- | ----------------------------- |
| `key`         | `string`                           | Flag identifier               |
| `decide`      | `function`                         | Resolves value                |
| `description` | `string`                           | Shown in Flags Explorer       |
| `origin`      | `string`                           | URL to manage flag            |
| `options`     | `{ label?: string, value: any }[]` | Possible values               |
| `identify`    | `function`                         | Returns evaluation context    |

### `createHandle`

Server hook that establishes context for flags and handles `/.well-known/vercel/flags`.

| Parameter       | Type                                               | Description          |
| --------------- | -------------------------------------------------- | -------------------- |
| `options.secret`| `string`                                           | `FLAGS_SECRET`       |
| `options.flags` | `Record<string, Flag>`                             | Your flags           |

Must come first when composed with `sequence`.

### `getProviderData`

Turn flag declarations into Flags Explorer-compatible definitions.

### `precompute`

Evaluate multiple flags, return encoded string.

| Parameter | Type         | Description   |
| --------- | ------------ | ------------- |
| `flags`   | `function[]` | Flag group    |
| `request` | `Request`    | Current request |

### `generatePermutations`

Generate all precomputation codes for prerendering.

| Parameter | Type         | Description                      |
| --------- | ------------ | -------------------------------- |
| `flags`   | `function[]` | Flags with options               |
| `filter`  | `function`   | Optional filter                  |
| `secret`  | `string`     | Defaults to `FLAGS_SECRET`       |
