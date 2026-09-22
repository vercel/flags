# Flags SDK + Flagsmith

A minimal Next.js App Router example with two server-evaluated flags.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fflagsmith&env=FLAGSMITH_ENVIRONMENT_KEY,FLAGS_SECRET&envDescription=Use%20your%20Flagsmith%20server-side%20environment%20key%20and%20a%20random%2032-byte%20base64url%20FLAGS_SECRET.&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fflagsmith%23setup&project-name=flagsmith-example&repository-name=flagsmith-example)

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
pnpm exec turbo run dev --filter=flagsmith-example
```

The root `pnpm-workspace.yaml` overrides this example's `flags` and `@flags-sdk/flagsmith` dependencies to `workspace:*`. All flags in this example use the local SDK and adapter, with local evaluation explicitly enabled. Turbo builds the workspace dependencies before starting Next.js.

For a production build:

```sh
pnpm exec turbo run build --filter=flagsmith-example
pnpm --filter flagsmith-example start
```

To deploy the workspace version on Vercel:

1. Import the full Flags SDK repository and set **Root Directory** to `examples/flagsmith`.
2. Enable **Include source files outside of the Root Directory in the Build Step**.
3. Set **Install Command** to `cd ../.. && pnpm install --frozen-lockfile`.
4. Set **Build Command** to `cd ../.. && pnpm exec turbo run build --filter=flagsmith-example`.
5. Add the environment variables from Setup.

When cloned independently, the root overrides are absent and the regular versions in `package.json` resolve from npm. No workspace files, shared TypeScript configuration, or build scripts are needed for the standalone app.

This example requires `@flags-sdk/flagsmith` 2.0.0 or later. Until that release is published, run it from this workspace; standalone installs and the Deploy button require the published 2.x release.
