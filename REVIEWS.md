# How to review pull requests for packages

This documentation is intended for maintainers of this repository.

## Checking out a branch of a fork

Follow the following steps to review a pull request from a fork.
The example uses hypertunehq.

- `git remote add hypertunehq git@github.com:hypertunehq/flags.git`
- `git fetch hypertunehq`
- `git checkout hypertunehq/update-hypertune-adapter`

Or replace the last step with:

- `git checkout -b update-hypertune-adapter hypertunehq:update-hypertune-adapter`

## Testing with examples

You can try an updates to adapters with the existing examples in [vercel/examples](https://github.com/vercel/examples/tree/main/flags-sdk).

1. Build the adapter

- `cd packages/adapter-hypertune`
- `pnpm build`

2. Try it out

- Clone https://github.com/vercel/examples/
- Change into `flags-sdk/hypertune`
- Run `pnpm install`
- Run `vc link` and link to `Vercel Examples` team and `flags-sdk-hypertune` package
- Run `vc env pull`
- Change the `@flags-sdk/launchdarkly` dependency of `flags-sdk/hypertune/package.json` to a relative path
  - `"@flags-sdk/launchdarkly": "file:../../../flags/packages/adapter-hypertune"`
- Run `pnpm install`
