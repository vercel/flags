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

You can test SDK and adapter changes with the apps in [examples](../examples). Choose an example that uses the package you are reviewing and follow its README for setup.

In the commands below, replace `<example-folder>` with the folder under `examples/` and `<example-package>` with the `name` from that example's `package.json`.

1. From the repository root, run `pnpm install`.
2. Configure the environment variables described in `examples/<example-folder>/README.md`. If the example provides `.env.example`, copy it to `.env.local` in that folder and fill in the values. For an existing Vercel project, run `vc link` and `vc env pull` from the example folder.
3. From the repository root, start the example:

   ```sh
   pnpm exec turbo run dev --filter=<example-package>
   ```

Workspace dependencies and overrides in `pnpm-workspace.yaml` link examples to the local SDK and adapter packages. Turbo builds the configured dependencies before starting the app. After changing SDK or adapter code, restart this command to rebuild the packages.

The root `pnpm build` builds only `packages/*`, so contributors do not need example credentials. Use `pnpm build:all` to build the entire workspace, including all examples and apps, after configuring their environments. To build only a selected example and its dependencies, run:

```sh
pnpm exec turbo run build --filter=<example-package>
```
