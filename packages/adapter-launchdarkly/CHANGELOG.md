# @flags-sdk/launchdarkly

## 0.3.3

### Patch Changes

- ff052f0: upgrade internal @vercel/edge-config dependency to v1.4.3

## 0.3.2

### Patch Changes

- e1def0e: Significantly improve performance by upgrading to `@launchdarkly/vercel-server-sdk` v1.3.34.

  This release avoids JSON.stringify and JSON.parse overhead which earlier versions of `@launchdarkly/vercel-server-sdk` had.

  See

  - https://github.com/launchdarkly/js-core/releases/tag/vercel-server-sdk-v1.3.34
  - https://github.com/launchdarkly/js-core/pull/918

## 0.3.1

### Patch Changes

- 595e9d0: only read edge config once per request

## 0.3.0

### Minor Changes

- 917ef42: change API from ldAdapter() to ldAdapter.variation()

### Patch Changes

- b375e4e: add metadata to package.json
- 917ef42: expose ldClient on default ldAdapter

## 0.2.1

### Patch Changes

- fbc886a: expose ldAdapter.ldClient
- fbc886a: expose as ldAdapter

## 0.2.0

### Minor Changes

- 2fcc446: Add LaunchDarkly adapter

## 0.1.0

### Minor Changes

- 3c66284: initialize
