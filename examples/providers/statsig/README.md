# Flags SDK + Statsig

A minimal Next.js App Router example with two server-evaluated flags.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fstatsig&env=FLAGS_SECRET&envDescription=The+Statsig+integration+provides+STATSIG_SERVER_API_KEY.+This+example+uses+the+automatically+generated+FLAGS_SECRET+for+Flags+Explorer.+See+setup+instructions.&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fstatsig%23setup&project-name=flags-sdk-statsig&repository-name=flags-sdk-statsig&products=%5B%7B%22integrationSlug%22%3A%22statsig%22%2C%22productSlug%22%3A%22statsig%22%2C%22type%22%3A%22integration%22%2C%22protocol%22%3A%22experimentation%22%7D%5D)

The Deploy button copies only this folder and uses the standard Next.js build command. See [Run inside the Flags SDK repository](#run-inside-the-flags-sdk-repository) for the workspace dependencies.

## Setup

Install the [Statsig integration](https://vercel.com/marketplace/statsig), or use an existing Statsig project.

Create these two entities in your Statsig project:

| Name | Type | Configuration | Flag key |
| --- | --- | --- | --- |
| `welcome_message_text` | Dynamic Config | Set the default value to `{ "text": "Welcome to the Statsig example" }`. | `config:welcome_message_text.text` |
| `show_banner` | Feature Gate | Add a rule that passes for everyone (100%). | `show_banner` |

Copy `.env.example` to `.env.local` and set:

- `STATSIG_SERVER_API_KEY`: a server secret key from the API Keys settings of your Statsig project.
- `FLAGS_SECRET`: generate a random secret with the command below.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

For a linked Vercel project, `vercel env pull` can populate `.env.local`.

`flags.ts` defines a source with `StatsigProvider`, the OpenFeature provider of `@flags-sdk/statsig/openfeature`, and binds both flags to it with `source.bindFlag`. The provider uses the Statsig Server Core SDK (`@statsig/statsig-node-core`). Creating the provider does not open a connection, so the build can import `flags.ts` without the key. The provider fetches the rules before the first evaluation, and syncs them in the background.

The flag key selects the Statsig entity. A plain key, such as `show_banner`, is a feature gate. The prefixes `config:`, `experiment:` and `layer:` select a dynamic config, an experiment or a layer. The suffix `.text` reads the `text` parameter of the dynamic config.

The home page uses `evaluate()` from `flags` to evaluate both flags. Change the dynamic config or the feature gate in Statsig and refresh the page after the SDK has synced. Every visitor uses the same `demo-user` context; change `getEvaluationContext` in `flags.ts` to add user targeting. It runs once per request for all flags of the source. The provider gives `targetingKey` to Statsig as the `userID`.

The Statsig Server Core SDK loads a native module. Next.js keeps `@statsig/statsig-node-core` external on the server by default, so `next.config.ts` needs no `serverExternalPackages` entry.

The v4 version of this example could read the Statsig rules from Global Config (`EXPERIMENTATION_CONFIG`). This version does not use Global Config: the provider fetches the rules from Statsig.

## Flags Explorer

`flags.ts` starts with `'use flags'`, so `withFlags` in `next.config.ts` registers its flags. The route `app/.well-known/flags/manifest.json` returns their definitions in development, and the production build writes them to `.next/flags-manifest.json`. `FlagValues` from `@flags-sdk/next/flag-values` reports the evaluated values to the toolbar.

The Vercel Toolbar is included during local development. Link this folder with `vercel link` and add the same `FLAGS_SECRET` to the linked project's Development environment as a regular environment variable (Config). Alternatively, pull an existing value with `vercel env pull .env.local`. Restart the dev server after linking.

Sign in to the toolbar and open Flags Explorer to override the greeting or banner for your session without changing the values in Statsig. Vercel injects the toolbar on preview deployments when enabled in project settings; configure the credentials and a matching `FLAGS_SECRET` for that environment.

`FLAGS_SECRET` is optional on Vercel with `flags` 4.5.0 or later, as long as the project exposes the system environment variables: Vercel signs the Flags Explorer requests and overrides for the project. Locally, run `vercel env pull` to use Flags Explorer without one. This example sets a `FLAGS_SECRET` so that it also works outside Vercel.

## Run as a standalone project

Copy this folder, or use the Deploy button above. From the copied folder:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. For a production build, run `pnpm build` and `pnpm start`. Node.js 22 or newer is recommended.

## Run inside the Flags SDK repository

Configure `examples/providers/statsig/.env.local` as described above. From the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-statsig
```

The `package.json` of this example uses the workspace packages of the Flags SDK v5 (`flags`, `@flags-sdk/next`, `@flags-sdk/statsig`) through `workspace:*`. Turbo builds them before it starts Next.js.

The root `pnpm build` builds only `packages/*`. Use `pnpm build:all` to build the entire workspace, including all examples and apps, after configuring their environments. To build only this example and its dependencies:

```sh
pnpm exec turbo run build --filter=flags-sdk-statsig
pnpm --filter flags-sdk-statsig start
```

To deploy the workspace version on Vercel:

1. Import the full Flags SDK repository and set **Root Directory** to `examples/providers/statsig`.
2. Enable **Include source files outside of the Root Directory in the Build Step**.
3. Set **Install Command** to `cd ../../.. && pnpm install --frozen-lockfile`.
4. Set **Build Command** to `cd ../../.. && pnpm exec turbo run build --filter=flags-sdk-statsig`.
5. Add the environment variables from Setup.

When you copy this folder out of the repository, replace the `workspace:*` versions in `package.json` with the published versions of these packages.
