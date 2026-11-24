# Flags SDK + PostHog

A minimal Next.js App Router example with two server-evaluated flags, adapted from the [PostHog example](https://github.com/vercel/examples/tree/main/flags-sdk/posthog).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fposthog&env=POSTHOG_PROJECT_API_KEY%2CPOSTHOG_HOST%2CFLAGS_SECRET&envDescription=Provide+your+PostHog+project+API+key+%28phc_...%29+and+regional+host.+This+example+uses+the+automatically+generated+FLAGS_SECRET+for+Flags+Explorer.+See+setup+instructions.&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fposthog%23setup&project-name=flags-sdk-posthog&repository-name=flags-sdk-posthog)

The Deploy button copies only this folder and uses the standard Next.js build command. See [Run inside the Flags SDK repository](#run-inside-the-flags-sdk-repository) for the workspace dependencies.

## Setup

Create these feature flags in your PostHog project and enable them for 100% of users:

| Flag key | Type | Enabled payload |
| --- | --- | --- |
| `welcome_message` | Boolean with a JSON string payload | `"Hello from PostHog"` |
| `show_banner` | Boolean | None |

For `welcome_message`, attach the JSON string payload (including the quotes) to the enabled value.

Copy `.env.example` to `.env.local` and set:

- `POSTHOG_PROJECT_API_KEY`: your project API key (`phc_...`), from PostHog project settings.
- `POSTHOG_HOST`: your regional API host, `https://us.i.posthog.com` or `https://eu.i.posthog.com`.
- `FLAGS_SECRET`: generate a random secret with the command below. Add it to both `.env.local` and the matching environment in your Vercel project settings. For Development, use a regular environment variable (Config), rather than a Secret.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Optionally set `POSTHOG_SECRET_KEY` to a feature flags secret key (`phs_...`) to enable local evaluation. By default, PostHog evaluates the flags remotely.

`flags.ts` creates the PostHog client of `posthog-node` and defines a source with `PostHogProvider`, the OpenFeature provider of `@flags-sdk/posthog/openfeature`. It binds both flags to the source with `source.bindFlag`:

- `show_banner` has the type `boolean`: the provider reads whether the flag is enabled.
- `welcome_message` has the type `object`: the provider reads the JSON payload of the flag. A flag of the type `string` reads the variant key of a multivariate flag instead.

Without `POSTHOG_PROJECT_API_KEY`, the PostHog client is disabled and both flags use their default values. The build does not fail.

The home page uses `evaluate()` from `flags` to evaluate both flags. Change their values in PostHog and refresh the page. Every visitor uses the same `demo-user` distinct ID; change `getEvaluationContext` in `flags.ts` to add user targeting. It runs once per request for all flags of the source. The provider reads `targetingKey` as the distinct ID, `groups`, `personProperties` and `groupProperties` with the same names, and other attributes as person properties.

## Flags Explorer

`flags.ts` starts with `'use flags'`, so `withFlags` in `next.config.ts` registers its flags. The route `app/.well-known/flags/manifest.json` returns their definitions in development, and the production build writes them to `.next/flags-manifest.json`. Flags Explorer shows the flags of the code; flags which exist only in PostHog and links to the PostHog dashboard are not part of the manifest. `FlagValues` from `@flags-sdk/next/flag-values` reports the evaluated values to the toolbar.

The v4 version of this example loaded the flag metadata from PostHog with `getProviderData`. This version does not, so it does not need `POSTHOG_PROJECT_SECRET_API_KEY` or `POSTHOG_PROJECT_ID`.

The Vercel Toolbar is included during local development. Link this folder with `vercel link` and add the same `FLAGS_SECRET` to the linked project's Development environment as a regular environment variable (Config). Alternatively, pull an existing value with `vercel env pull .env.local`. Restart the dev server after linking.

Sign in to the toolbar and open Flags Explorer to override `welcome_message` or `show_banner` for your session without changing their values in PostHog. Vercel injects the toolbar on preview deployments when enabled in project settings; configure the credentials and a matching `FLAGS_SECRET` for that environment.

`FLAGS_SECRET` is optional on Vercel with `flags` 4.5.0 or later, as long as the project exposes the system environment variables: Vercel signs the Flags Explorer requests and overrides for the project. Locally, run `vercel env pull` to use Flags Explorer without one. This example sets a `FLAGS_SECRET` so that it also works outside Vercel.

## Run as a standalone project

Copy this folder or use the Deploy button, configure `.env.local`, then run:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. For a production build, run `pnpm build` and `pnpm start`. Use Node.js 22.22 or newer.

## Run inside the Flags SDK repository

Configure `examples/providers/posthog/.env.local`, then from the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-posthog
```

The `package.json` of this example uses the workspace packages of the Flags SDK v5 (`flags`, `@flags-sdk/next`, `@flags-sdk/posthog`) through `workspace:*`. Turbo builds them before it starts Next.js.

To build this example and its dependencies:

```sh
pnpm exec turbo run build --filter=flags-sdk-posthog
pnpm --filter flags-sdk-posthog start
```

To deploy the workspace version on Vercel:

1. Import the full Flags SDK repository and set **Root Directory** to `examples/providers/posthog`.
2. Enable **Include source files outside of the Root Directory in the Build Step**.
3. Set **Install Command** to `cd ../../.. && pnpm install --frozen-lockfile`.
4. Set **Build Command** to `cd ../../.. && pnpm exec turbo run build --filter=flags-sdk-posthog`.
5. Add the environment variables from Setup.

When you copy this folder out of the repository, replace the `workspace:*` versions in `package.json` with the published versions of these packages.
