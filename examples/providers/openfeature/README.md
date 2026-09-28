# Flags SDK + OpenFeature

A minimal Next.js App Router example with two server-evaluated flags, adapted from the [OpenFeature example](https://github.com/vercel/examples/tree/main/flags-sdk/openfeature). It uses OpenFeature's built-in `InMemoryProvider` so no provider account or credentials are needed.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fopenfeature&env=FLAGS_SECRET&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fopenfeature%23setup&project-name=flags-sdk-openfeature&repository-name=flags-sdk-openfeature)

The Deploy button copies only this folder and installs published packages using the standard Next.js build command.

## Setup

Copy `.env.example` to `.env.local` and set `FLAGS_SECRET` to a random secret:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The home page uses `evaluate()` to evaluate `welcome_message` and `show_banner`. Change the greeting or switch the banner's `defaultVariant` from `on` to `off` in `flags.ts`, then refresh the page. Every visitor uses the same `demo-user` targeting key; replace `identify` to add user targeting.

The in-memory provider is for demonstration. Replace it with your OpenFeature provider in `flags.ts` for production. The adapter waits for provider initialization before evaluating flags.

## Flags Explorer

This example has no upstream provider service. Its discovery endpoint at `/.well-known/vercel/flags` uses `getProviderData` from `flags/next` to expose the definitions declared in `flags.ts`, protected by `FLAGS_SECRET`. The page reports the evaluated values to the toolbar.

The Vercel Toolbar is included during local development. Link this folder with `vercel link` and add the same `FLAGS_SECRET` to the linked project's Development environment. Use a regular environment variable (Config), rather than a Secret. Alternatively, pull an existing value with `vercel env pull .env.local`.

Sign in to the toolbar and open Flags Explorer to override the greeting or banner for your session without changing the in-memory provider configuration. Vercel injects the toolbar on preview deployments when enabled in project settings; configure a matching `FLAGS_SECRET` for that environment.

## Run as a standalone project

Copy this folder, or use the Deploy button above. From the copied folder:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. For a production build, run `pnpm build` and `pnpm start`. Use Node.js 22 or newer.

## Run inside the Flags SDK repository

Configure `examples/providers/openfeature/.env.local` as above. From the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-openfeature
```

The root `pnpm-workspace.yaml` overrides `flags` and `@flags-sdk/openfeature` with local workspace packages. Explicit dependencies in the root `turbo.json` build them before starting the example. To build only this example and its dependencies:

```sh
pnpm exec turbo run build --filter=flags-sdk-openfeature
pnpm --filter flags-sdk-openfeature start
```

When cloned independently, the root overrides are absent and the versions in `package.json` resolve from npm. No shared workspace configuration is required.
