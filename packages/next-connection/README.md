# next-connection

Conditionally exports Next.js's `connection()` function or a no-op depending on the build target.

## Purpose

This package allows library authors to use `await connection()` from `next/server` when their library runs in Next.js, while providing a no-op fallback for non-Next.js environments. This enables you to ship a single source file that works in both contexts.

## How it works

The package uses [conditional exports](https://nodejs.org/api/packages.html#conditional-exports) to provide different implementations:

- **`next-js` condition**: Re-exports `connection` from `next/server`
- **`default` condition**: Exports an async no-op function

```json
{
  "exports": {
    ".": {
      "next-js": { "import": "./dist/next.js" },
      "default": { "import": "./dist/noop.js" }
    }
  }
}
```

## Usage

```ts
import { connection } from 'next-connection';

// In Next.js: calls the real connection() from next/server
// Outside Next.js: calls an async no-op
await connection();
```

## Building your library

To support both Next.js and non-Next.js environments, you need to build your library twice and use conditional exports.

### 1. Build twice with different conditions

Use tsup (or esbuild directly) to create two bundles from the same source:

```js
// tsup.config.js
import { defineConfig } from 'tsup';

export default [
  // Default bundle (non-Next.js)
  defineConfig({
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
  }),
  // Next.js bundle
  defineConfig({
    entry: { 'index.next-js': 'src/index.ts' },
    format: ['esm', 'cjs'],
    clean: false,
    dts: false,
    esbuildOptions(options) {
      options.conditions = ['next-js'];
    },
  }),
];
```

This produces:
- `dist/index.js` - resolves `next-connection` to the no-op
- `dist/index.next-js.js` - resolves `next-connection` to the real `connection()`

### 2. Configure conditional exports in package.json

```json
{
  "exports": {
    ".": {
      "next-js": {
        "import": "./dist/index.next-js.js",
        "require": "./dist/index.next-js.cjs"
      },
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

When Next.js bundles your library, it sets the `next-js` condition and resolves to the Next.js-specific bundle. Other bundlers use the default bundle with the no-op.
