# Flags SDK + PostHog

A minimal Next.js App Router example with two server-evaluated flags, adapted from the [PostHog example](https://github.com/vercel/examples/tree/main/flags-sdk/posthog).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fposthog&env=POSTHOG_PROJECT_API_KEY,POSTHOG_HOST,FLAGS_SECRET&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fposthog%23setup&project-name=flags-sdk-posthog&repository-name=flags-sdk-posthog)

The Deploy button copies only this folder. It installs published SDK packages and uses the standard Next.js build command.

## Setup

Create these feature flags in your PostHog project and enable them for 100% of users:

| Flag key | Type | Enabled payload |
| --- | --- | --- |
| `welcome_message` | Boolean with a JSON string payload | `"Hello from PostHog"` |
| `show_banner` | Boolean | None |

For `welcome_message`, attach the JSON string payload (including the quotes) to the enabled value. The example reads it with `postHogAdapter.payload`. The `show_banner` flag reads the boolean value with `postHogAdapter`.

Copy `.env.example` to `.env.local` and set:

- `POSTHOG_PROJECT_API_KEY`: your project API key (`phc_...`), from PostHog project settings.
- `POSTHOG_HOST`: your regional API host, `https://us.i.posthog.com` or `https://eu.i.posthog.com`.
- `FLAGS_SECRET`: generate a random secret with the command below. Add it to both `.env.local` and the matching environment in your Vercel project settings. For Development, use a regular environment variable (Config), rather than a Secret.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Optionally set `POSTHOG_SECRET_KEY` to a feature flags secret key (`phs_...`) to enable local evaluation. By default, the adapter evaluates flags remotely.

The home page uses the Flags SDK's `evaluate()` API to evaluate both flags. Change their values in PostHog and refresh the page. Every visitor uses the same `demo-user` identity; replace `identify` in `flags.ts` to add user targeting.

## Flags Explorer

The example exposes both flag definitions at `/.well-known/vercel/flags`, protected by `FLAGS_SECRET`, and reports their evaluated values to the toolbar.

The Vercel Toolbar is included during local development. Link this folder with `vercel link`, sign in to the toolbar, and open Flags Explorer to override `welcome_message` or `show_banner` for your session without changing their values in PostHog. The local `FLAGS_SECRET` must match the linked project's Development value. Vercel injects the toolbar on preview deployments when enabled in project settings.

## Run as a standalone project

Copy this folder, or use the Deploy button above. From the copied folder:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. For a production build, run `pnpm build` and `pnpm start`. Use Node.js 22.22 or newer.

## Run inside the Flags SDK repository

Configure `examples/providers/posthog/.env.local` as described above. From the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-posthog
```

The root `pnpm-workspace.yaml` overrides this example's `flags` and `@flags-sdk/posthog` dependencies to `workspace:*`. Explicit task dependencies in the root `turbo.json` ensure Turbo builds the local SDK and adapter before starting Next.js, since Turbo does not infer workspace links from pnpm overrides.

To build only this example and its dependencies:

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

When cloned independently, the root overrides are absent and the regular versions in `package.json` resolve from npm. No workspace files, shared TypeScript configuration, or build scripts are needed for the standalone app.
