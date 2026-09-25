# Flags SDK + Reflag

A minimal Next.js App Router example with two server-evaluated boolean flags, adapted from the [original Reflag example](https://github.com/vercel/examples/tree/main/flags-sdk/reflag).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Freflag&env=FLAGS_SECRET,REFLAG_SECRET_KEY&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Freflag%23setup&project-name=flags-sdk-reflag&repository-name=flags-sdk-reflag)

The Deploy button copies only this folder. It installs published SDK packages and uses the standard Next.js build command.

## Setup

Create the following flags in your [Reflag environment](https://app.reflag.com) and enable them for the demo company, or use a 100% rollout to enable both flags:

| Flag key | Type |
| --- | --- |
| `welcome_message` | Boolean |
| `show_banner` | Boolean |

Copy `.env.example` to `.env.local` and set:

- `REFLAG_SECRET_KEY`: the server-side secret key for your Reflag environment.
- `FLAGS_SECRET`: generate a random secret with the command below. Add it to both `.env.local` and the matching environment in your Vercel project settings. For Development, use a regular environment variable (Config), rather than a Secret.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

For a linked Vercel project, `vercel env pull` can populate `.env.local`.

The home page uses the Flags SDK's `evaluate()` API to evaluate both flags. Change their targeting in Reflag and refresh the page after the Reflag SDK has refreshed its configuration. Every visitor uses the same `demo-company` context; replace `identify` in `flags.ts` to add company or user targeting. Both flags default to `false`. The Reflag adapter evaluates boolean flags: `welcome_message` switches the heading to "Hello from Reflag", and `show_banner` displays the banner.

## Flags Explorer

The example exposes both flag definitions at `/.well-known/vercel/flags`, protected by `FLAGS_SECRET`, and reports their evaluated values to the toolbar.

The Vercel Toolbar is included during local development. Link this folder with `vercel link`, sign in to the toolbar, and open Flags Explorer to override `welcome_message` or `show_banner` for your session without changing their values in Reflag. The local `FLAGS_SECRET` must match the linked project's Development value. Vercel injects the toolbar on preview deployments when enabled in project settings.

## Run as a standalone project

Copy this folder, or use the Deploy button above. From the copied folder:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. For a production build, run `pnpm build` and `pnpm start`. Node.js 22 or newer is recommended.

## Run inside the Flags SDK repository

Configure `examples/providers/reflag/.env.local` as described above. From the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-reflag
```

The root `pnpm-workspace.yaml` overrides this example's `flags` and `@flags-sdk/reflag` dependencies to `workspace:*`. Explicit task dependencies in the root `turbo.json` ensure Turbo builds the local SDK and adapter before starting Next.js, since Turbo does not infer workspace links from pnpm overrides.

The root `pnpm build` builds only `packages/*`. Use `pnpm build:all` to build the entire workspace, including all examples and apps, after configuring their environments. To build only this example and its dependencies:

```sh
pnpm exec turbo run build --filter=flags-sdk-reflag
pnpm --filter flags-sdk-reflag start
```

To deploy the workspace version on Vercel:

1. Import the full Flags SDK repository and set **Root Directory** to `examples/providers/reflag`.
2. Enable **Include source files outside of the Root Directory in the Build Step**.
3. Set **Install Command** to `cd ../../.. && pnpm install --frozen-lockfile`.
4. Set **Build Command** to `cd ../../.. && pnpm exec turbo run build --filter=flags-sdk-reflag`.
5. Add the environment variables from Setup.

When cloned independently, the root overrides are absent and the regular versions in `package.json` resolve from npm. No workspace files, shared TypeScript configuration, or build scripts are needed for the standalone app.
