# @vercel/flags-core

## 1.0.1

### Patch Changes

- 7d7719a: Fixed an issue where concurrent flag evaluations (e.g. `Promise.all([client.evaluate('a'), client.evaluate('b')])`) would each trigger a separate initialization, causing a flood of network requests to the flags service. Also fixed stream disconnect during initialization from starting a duplicate polling cycle.

## 1.0.0

### Major Changes

- c71729b: See http://vercel.com/docs/flags/vercel-flags for more information.

### Patch Changes

- Updated dependencies [795dfd4]
  - flags@4.0.3

## 0.1.8

### Patch Changes

- 620974c: [internal] change label to note

## 0.1.7

### Patch Changes

- 43293a3: depend directly on @vercel/edge-config (removed as peer dep)

## 0.1.6

### Patch Changes

- 5f3757a: drop tsconfig dependency
- Updated dependencies [5f3757a]
  - flags@4.0.2

## 0.1.5

### Patch Changes

- 6a7313a: publish cjs bundles besides esm

## 0.1.4

### Patch Changes

- df76e2c: export evaluate fn

## 0.1.3

### Patch Changes

- 9ecc4de: export Packed type

## 0.1.2

### Patch Changes

- bfe9080: export DataSource type

## 0.1.1

### Patch Changes

- ff052f0: upgrade internal @vercel/edge-config dependency to v1.4.3
