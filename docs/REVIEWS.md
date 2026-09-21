# How to review pull requests for packages

This documentation is intended for maintainers of this repository.

## Checking out a branch of a fork

Follow the following steps to review a pull request from a fork.
Replace `<fork-owner>` and `<branch>` with the GitHub user and branch of the pull request.

- `git remote add <fork-owner> git@github.com:<fork-owner>/flags.git`
- `git fetch <fork-owner>`
- `git checkout <fork-owner>/<branch>`

Or replace the last step with:

- `git checkout -b <branch> <fork-owner>/<branch>`

## Testing with examples

You can try an updates to adapters with the existing examples in [vercel/examples](https://github.com/vercel/examples/tree/main/flags-sdk).
The example uses the LaunchDarkly adapter.

1. Build the adapter

- `cd packages/adapter-launchdarkly`
- `pnpm build`

2. Try it out

- Clone https://github.com/vercel/examples/
- Change into `flags-sdk/launchdarkly`
- Run `pnpm install`
- Run `vc link` and link to `Vercel Examples` team and `flags-sdk-launchdarkly` project
- Run `vc env pull`
- Change the `@flags-sdk/launchdarkly` dependency of `flags-sdk/launchdarkly/package.json` to a relative path
  - `"@flags-sdk/launchdarkly": "file:../../../flags/packages/adapter-launchdarkly"`
- Run `pnpm install`
