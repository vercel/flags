# Flags SDK + Flagsmith

A minimal Next.js App Router example with two server-evaluated flags.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fflagsmith&env=FLAGSMITH_ENVIRONMENT_KEY,FLAGSMITH_ENVIRONMENT_ID,FLAGSMITH_PROJECT_ID,FLAGS_SECRET&envDescription=Use%20your%20Flagsmith%20server-side%20environment%20key%20and%20a%20random%2032-byte%20base64url%20FLAGS_SECRET.&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fflagsmith%23setup&project-name=flags-sdk-flagsmith&repository-name=flags-sdk-flagsmith)

The Deploy button copies only this folder. It installs published SDK packages and uses the standard Next.js build command.

## Setup

Create these flags in your Flagsmith environment:

| Flag | Enabled | Value |
| --- | --- | --- |
| `welcome_message` | Yes | `Hello from Flagsmith` |
| `show_banner` | Yes | `true` |

Copy `.env.example` to `.env.local` and set `FLAGSMITH_ENVIRONMENT_KEY` to the environment's **server-side SDK key**. Generate `FLAGS_SECRET` with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The home page uses the Flags SDK’s `evaluate()` API. The string and boolean flags form separate batches because they use different coercion modes. Change their values in Flagsmith and refresh the page. This example opts into local evaluation, sharing an environment document across evaluations and refreshing it every 60 seconds. Disabled or unavailable flags use the defaults in `flags.ts`. This example uses environment-level flags without user targeting.

## Local evaluation on a long-running server

`enableLocalEvaluation: true` is already set in the `createFlagsmithAdapter` configuration in `flags.ts`. This uses the server-side key already configured for the example and downloads an environment document, then polls every 60 seconds. Allow up to 60 seconds for dashboard changes to appear. Call `await adapter.close()` when shutting down your server.

For serverless deployments, set `enableLocalEvaluation: false` (or remove the option) to use the adapter’s default remote evaluation and avoid environment-document initialization on each cold start. See the [adapter documentation](https://flags-sdk.dev/providers/flagsmith) for local evaluation's identity-trait caveat.

## Flags Explorer

The discovery endpoint at `/.well-known/vercel/flags` loads metadata from Flagsmith using `getProviderData` from `@flags-sdk/flagsmith`, protected by `FLAGS_SECRET`. The page reports evaluated values to the toolbar.

Set `FLAGSMITH_ENVIRONMENT_ID` to the environment's **client-side environment key**, and `FLAGSMITH_PROJECT_ID` to the project ID from the dashboard URL. Discovery uses this key to fetch metadata and construct dashboard links. Keep the `ser.` server-side key in `FLAGSMITH_ENVIRONMENT_KEY` for local evaluation; do not use it as the metadata environment ID.

The Vercel Toolbar is included during local development. Link this folder with `vercel link` and add the same `FLAGS_SECRET` to the linked project's Development environment as a regular environment variable (Config). Alternatively, pull an existing value with `vercel env pull .env.local`. Restart the dev server after linking.

Sign in to the toolbar and open Flags Explorer to override the greeting or banner for your session. Vercel injects the toolbar on preview deployments when enabled in project settings; configure the credentials and a matching `FLAGS_SECRET` for that environment.

## Run as a standalone project

Copy this folder, or use the Deploy button above. From the copied folder:

```sh
npm install
npm run dev
```

Open http://localhost:3000. For a production build, run `npm run build` and `npm start`. Node.js 22 or newer is recommended.

## Run inside the Flags SDK repository

From the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-flagsmith
```

The root `pnpm-workspace.yaml` overrides this example's `flags` and `@flags-sdk/flagsmith` dependencies to `workspace:*`. All flags in this example use the local SDK and adapter, with local evaluation explicitly enabled. Turbo builds the workspace dependencies before starting Next.js.

For a production build:

```sh
pnpm exec turbo run build --filter=flags-sdk-flagsmith
pnpm --filter flags-sdk-flagsmith start
```

To deploy the workspace version on Vercel:

1. Import the full Flags SDK repository and set **Root Directory** to `examples/providers/flagsmith`.
2. Enable **Include source files outside of the Root Directory in the Build Step**.
3. Set **Install Command** to `cd ../../.. && pnpm install --frozen-lockfile`.
4. Set **Build Command** to `cd ../../.. && pnpm exec turbo run build --filter=flags-sdk-flagsmith`.
5. Add the environment variables from Setup.

When cloned independently, the root overrides are absent and the regular versions in `package.json` resolve from npm. No workspace files, shared TypeScript configuration, or build scripts are needed for the standalone app.

This example requires `@flags-sdk/flagsmith` 2.0.0 or later.
