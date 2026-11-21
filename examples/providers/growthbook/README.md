# Flags SDK + GrowthBook

A minimal Next.js App Router example with two server-evaluated flags.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fgrowthbook&env=GROWTHBOOK_CLIENT_KEY%2CFLAGS_SECRET&envDescription=GROWTHBOOK_CLIENT_KEY+is+the+client+key+of+your+GrowthBook+SDK+connection.+This+example+uses+the+automatically+generated+FLAGS_SECRET+for+Flags+Explorer.+See+setup+instructions.&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fgrowthbook%23setup&project-name=flags-sdk-growthbook&repository-name=flags-sdk-growthbook)

The Deploy button copies only this folder and uses the standard Next.js build command. See [Run inside the Flags SDK repository](#run-inside-the-flags-sdk-repository) for the workspace dependencies.

## Setup

Create these features in GrowthBook and include them in your SDK connection:

| Feature key | Type | Default value |
| --- | --- | --- |
| `welcome_message` | String | `Hello from GrowthBook` |
| `show_banner` | Boolean | `true` |

Copy `.env.example` to `.env.local` and set `GROWTHBOOK_CLIENT_KEY` to your SDK connection's client key. Generate `FLAGS_SECRET` with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`flags.ts` defines a source with `GrowthbookProvider`, the OpenFeature provider of `@openfeature/growthbook-provider`, and binds both flags to it with `source.bindFlag`. The provider creates the GrowthBook client of `@growthbook/growthbook` and loads the features before the first evaluation, then refreshes them every 60 seconds (`pollingInterval`). For self-hosted GrowthBook, set `GROWTHBOOK_API_HOST`.

The home page uses `evaluate()` from `flags` to evaluate both flags. Change their values in GrowthBook and refresh the page after the provider has refreshed the features. Every visitor uses the same `demo-user` context; change `getEvaluationContext` in `flags.ts` to add user targeting. It runs once per request for all flags of the source, and the provider gives its result to GrowthBook as the attributes.

## Flags Explorer

`flags.ts` starts with `'use flags'`, so `withFlags` in `next.config.ts` registers its flags. The route `app/.well-known/flags/manifest.json` returns their definitions in development, and the production build writes them to `.next/flags-manifest.json`. Flags Explorer shows the flags of the code; flags which exist only in GrowthBook and links to the GrowthBook dashboard are not part of the manifest. `FlagValues` from `@flags-sdk/next/flag-values` reports the evaluated values to the toolbar.

The Vercel Toolbar is included during local development. Link this folder with `vercel link` and add the same `FLAGS_SECRET` to the linked project's Development environment as a regular environment variable (Config). Alternatively, pull an existing value with `vercel env pull .env.local`. Restart the dev server after linking.

Sign in to the toolbar and open Flags Explorer to override the greeting or banner for your session. Vercel injects the toolbar on preview deployments when enabled in project settings; configure the credentials and a matching `FLAGS_SECRET` for that environment.

## Run as a standalone project

Copy this folder or use the Deploy button, configure `.env.local`, then run:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. For a production build, run `pnpm build` and `pnpm start`. Node.js 22 or newer is recommended.

## Run inside the Flags SDK repository

Configure `examples/providers/growthbook/.env.local`, then from the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-growthbook
```

The `package.json` of this example uses the workspace packages of the Flags SDK v5 (`flags`, `@flags-sdk/next`) through `workspace:*`. Turbo builds them before it starts Next.js.

To build this example and its dependencies:

```sh
pnpm exec turbo run build --filter=flags-sdk-growthbook
pnpm --filter flags-sdk-growthbook start
```

To deploy the workspace version on Vercel:

1. Import the full Flags SDK repository and set **Root Directory** to `examples/providers/growthbook`.
2. Enable **Include source files outside of the Root Directory in the Build Step**.
3. Set **Install Command** to `cd ../../.. && pnpm install --frozen-lockfile`.
4. Set **Build Command** to `cd ../../.. && pnpm exec turbo run build --filter=flags-sdk-growthbook`.
5. Add the environment variables from Setup.

When you copy this folder out of the repository, replace the `workspace:*` versions in `package.json` with the published versions of these packages.
