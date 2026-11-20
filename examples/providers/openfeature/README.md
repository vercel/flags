# Flags SDK + OpenFeature

A minimal Next.js App Router example with two server-evaluated flags, adapted from the [OpenFeature example](https://github.com/vercel/examples/tree/main/flags-sdk/openfeature). It uses OpenFeature's built-in `InMemoryProvider` so no provider account or credentials are needed.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fopenfeature&env=FLAGS_SECRET&envDescription=This+example+uses+the+automatically+generated+FLAGS_SECRET+for+Flags+Explorer.&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fopenfeature%23setup&project-name=flags-sdk-openfeature&repository-name=flags-sdk-openfeature)

The Deploy button copies only this folder and uses the standard Next.js build command. See [Run inside the Flags SDK repository](#run-inside-the-flags-sdk-repository) for the workspace dependencies.

## Setup

Copy `.env.example` to `.env.local` and set `FLAGS_SECRET` to a random secret:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`flags.ts` passes the OpenFeature provider directly to `defineSource`, and binds `welcome_message` and `show_banner` to that source with `source.bindFlag`. The home page uses `evaluate()` from `flags` to evaluate both flags. Change the greeting or switch the banner's `defaultVariant` from `on` to `off` in `flags.ts`, then refresh the page. Every visitor uses the same `demo-user` targeting key; change `getEvaluationContext` of the source to add user targeting. It runs once per request for all flags of the source.

The in-memory provider is for demonstration. Replace it with your OpenFeature server provider in `flags.ts` for production. The SDK initializes the provider before the first evaluation, so do not call `OpenFeature.setProviderAndWait()`. See [OpenFeature providers](https://flags-sdk.dev/providers/openfeature).

## Flags Explorer

This example has no upstream provider service. `flags.ts` starts with `'use flags'`, so `withFlags` in `next.config.ts` registers the flags declared in it. The route `app/.well-known/flags/manifest.json` returns their definitions in development, and the production build writes them to `.next/flags-manifest.json`. `FlagValues` from `@flags-sdk/next/flag-values` reports the evaluated values to the toolbar.

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

The `package.json` of this example uses the workspace packages of the Flags SDK v5 (`flags`, `@flags-sdk/next`) through `workspace:*`. Turbo builds them before it starts Next.js. To build only this example and its dependencies:

```sh
pnpm exec turbo run build --filter=flags-sdk-openfeature
pnpm --filter flags-sdk-openfeature start
```

When you copy this folder out of the repository, replace the `workspace:*` versions in `package.json` with the published versions of these packages.
