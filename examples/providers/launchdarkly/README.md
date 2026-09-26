# Flags SDK + LaunchDarkly

A minimal Next.js App Router example with two server-evaluated flags.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Flaunchdarkly&env=FLAGS_SECRET,LAUNCHDARKLY_API_KEY,LAUNCHDARKLY_ENVIRONMENT&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Flaunchdarkly%23setup&project-name=flags-sdk-launchdarkly&repository-name=flags-sdk-launchdarkly&products=%5B%7B%22integrationSlug%22%3A%22launchdarkly%22%2C%22productSlug%22%3A%22launchdarkly%22%2C%22type%22%3A%22integration%22%2C%22protocol%22%3A%22experimentation%22%7D%5D)

The Deploy button copies only this folder. It installs published SDK packages and uses the standard Next.js build command.

## Setup

Install the [LaunchDarkly integration](https://vercel.com/marketplace/launchdarkly) and enable **Global Config Syncing**. The integration provides the `EXPERIMENTATION_CONFIG` connection string used by the adapter.

Create these flags in your LaunchDarkly environment, enable **SDKs using Client-side ID**, and turn both flags on:

| Flag key | Type | Default rule value |
| --- | --- | --- |
| `welcome_message` | String | `Hello from LaunchDarkly` |
| `show_banner` | Boolean | `true` |

Copy `.env.example` to `.env.local` and set:

- `EXPERIMENTATION_CONFIG`: the Global Config connection string from the integration.
- `LAUNCHDARKLY_PROJECT_SLUG`: your LaunchDarkly project key.
- `LAUNCHDARKLY_CLIENT_SIDE_ID`: the client-side ID for your LaunchDarkly environment.
- `FLAGS_SECRET`: generate a random secret with the command below.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

For a linked Vercel project, `vercel env pull` can populate `.env.local`.

The home page uses the Flags SDK's `evaluate()` API to evaluate both flags. Change their values in LaunchDarkly and refresh the page once Global Config has synced. Every visitor uses the same `demo-user` context; replace `identify` in `flags.ts` to add user targeting.

## Flags Explorer

The discovery endpoint at `/.well-known/vercel/flags` loads flag metadata from LaunchDarkly using `getProviderData` from `@flags-sdk/launchdarkly`, protected by `FLAGS_SECRET`. The page reports evaluated values to the toolbar.

Set `LAUNCHDARKLY_API_KEY` to a LaunchDarkly REST API access token with read access to flags, and `LAUNCHDARKLY_ENVIRONMENT` to your environment key (for example, `test`). These are separate from the client-side ID and Global Config connection string. Discovery uses `LAUNCHDARKLY_PROJECT_SLUG` to load flags from the project and the environment key for dashboard links.

The Vercel Toolbar is included during local development. Link this folder with `vercel link` and add the same `FLAGS_SECRET` to the linked project's Development environment as a regular environment variable (Config). Alternatively, pull an existing value with `vercel env pull .env.local`. Restart the dev server after linking.

Sign in to the toolbar and open Flags Explorer to override the greeting or banner for your session. Vercel injects the toolbar on preview deployments when enabled in project settings; configure the credentials and a matching `FLAGS_SECRET` for that environment.

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

The root `pnpm-workspace.yaml` overrides this example's `flags` and `@flags-sdk/launchdarkly` dependencies to `workspace:*`. Explicit task dependencies in the root `turbo.json` ensure Turbo builds the local SDK and adapter before starting Next.js, since Turbo does not infer workspace links from pnpm overrides.

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

When cloned independently, the root overrides are absent and the regular versions in `package.json` resolve from npm. No workspace files, shared TypeScript configuration, or build scripts are needed for the standalone app.
