# Flags SDK + LaunchDarkly

A minimal Next.js App Router example with two server-evaluated flags.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Flaunchdarkly&env=LAUNCHDARKLY_PROJECT_SLUG%2CLAUNCHDARKLY_ENVIRONMENT%2CFLAGS_SECRET&envDescription=Provide+the+LaunchDarkly+project+and+environment+keys+for+the+links+of+Flags+Explorer.+The+LaunchDarkly+integration+provides+the+SDK+key.+This+example+uses+the+automatically+generated+FLAGS_SECRET+for+Flags+Explorer.+See+setup+instructions.&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Flaunchdarkly%23setup&project-name=flags-sdk-launchdarkly&repository-name=flags-sdk-launchdarkly&products=%5B%7B%22integrationSlug%22%3A%22launchdarkly%22%2C%22productSlug%22%3A%22launchdarkly%22%2C%22type%22%3A%22integration%22%2C%22protocol%22%3A%22experimentation%22%7D%5D)

The Deploy button copies only this folder and uses the standard Next.js build command. See [Run inside the Flags SDK repository](#run-inside-the-flags-sdk-repository) for the workspace dependencies.

## Setup

Install the [LaunchDarkly integration](https://vercel.com/marketplace/launchdarkly). The integration provides the `LAUNCHDARKLY_SDK_KEY` server-side SDK key, which the provider uses.

Create these flags in your LaunchDarkly environment and turn both flags on:

| Flag key | Type | Default rule value |
| --- | --- | --- |
| `welcome_message` | String | `Hello from LaunchDarkly` |
| `show_banner` | Boolean | `true` |

Copy `.env.example` to `.env.local` and set:

- `LAUNCHDARKLY_SDK_KEY`: the server-side SDK key of your LaunchDarkly environment.
- `LAUNCHDARKLY_PROJECT_SLUG`: your LaunchDarkly project key, for the links of Flags Explorer to LaunchDarkly.
- `LAUNCHDARKLY_ENVIRONMENT`: your environment key (for example, `test`), for the same links.
- `FLAGS_SECRET`: generate a random secret with the command below.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

For a linked Vercel project, `vercel env pull` can populate `.env.local`.

`flags/launchdarkly.ts` defines a source with `LaunchDarklyProvider`, the OpenFeature provider of `@launchdarkly/openfeature-node-server`, and `flags.ts` binds both flags to it with `source.bindFlag`. The source creates the provider on the first evaluation, because `new LaunchDarklyProvider()` opens a stream connection to LaunchDarkly at once, and the build imports `flags.ts` to write the flags manifest.

The home page uses `evaluate()` from `flags` to evaluate both flags. Change their values in LaunchDarkly and refresh the page. Every visitor uses the same `demo-user` context of kind `user`; change `getEvaluationContext` in `flags/launchdarkly.ts` to add user targeting. It runs once per request for all flags of the source. The provider reads `kind` as the LaunchDarkly context kind and `targetingKey` as its key.

## Flags Explorer

`flags.ts` starts with `'use flags'`, so `withFlags` in `next.config.ts` registers its flags. The route `app/.well-known/flags/manifest.json` returns their definitions in development, and the production build writes them to `.next/flags-manifest.json`. With `LAUNCHDARKLY_PROJECT_SLUG` and `LAUNCHDARKLY_ENVIRONMENT`, the source names its LaunchDarkly project, so Flags Explorer links each flag to its targeting page in LaunchDarkly. `FlagValues` from `@flags-sdk/next/flag-values` reports the evaluated values to the toolbar.

The Vercel Toolbar is included during local development. Link this folder with `vercel link` and add the same `FLAGS_SECRET` to the linked project's Development environment as a regular environment variable (Config). Alternatively, pull an existing value with `vercel env pull .env.local`. Restart the dev server after linking.

Sign in to the toolbar and open Flags Explorer to override the greeting or banner for your session. Vercel injects the toolbar on preview deployments when enabled in project settings; configure the credentials and a matching `FLAGS_SECRET` for that environment.

`FLAGS_SECRET` is optional on Vercel with `flags` 4.5.0 or later, as long as the project exposes the system environment variables: Vercel signs the Flags Explorer requests and overrides for the project. Locally, run `vercel env pull` to use Flags Explorer without one. This example sets a `FLAGS_SECRET` so that it also works outside Vercel.

## Run as a standalone project

Copy this folder, or use the Deploy button above. From the copied folder:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. For a production build, run `pnpm build` and `pnpm start`. Node.js 22 or newer is recommended.

## Run inside the Flags SDK repository

Configure `examples/providers/launchdarkly/.env.local` as described above. From the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-launchdarkly
```

The `package.json` of this example uses the workspace packages of the Flags SDK v5 (`flags`, `@flags-sdk/next`) through `workspace:*`. Turbo builds them before it starts Next.js.

The root `pnpm build` builds only `packages/*`. Use `pnpm build:all` to build the entire workspace, including all examples and apps, after configuring their environments. To build only this example and its dependencies:

```sh
pnpm exec turbo run build --filter=flags-sdk-launchdarkly
pnpm --filter flags-sdk-launchdarkly start
```

To deploy the workspace version on Vercel:

1. Import the full Flags SDK repository and set **Root Directory** to `examples/providers/launchdarkly`.
2. Enable **Include source files outside of the Root Directory in the Build Step**.
3. Set **Install Command** to `cd ../../.. && pnpm install --frozen-lockfile`.
4. Set **Build Command** to `cd ../../.. && pnpm exec turbo run build --filter=flags-sdk-launchdarkly`.
5. Add the environment variables from Setup.

When you copy this folder out of the repository, replace the `workspace:*` versions in `package.json` with the published versions of these packages.
