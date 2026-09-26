# Flags SDK + Statsig

A minimal Next.js App Router example with two server-evaluated flags.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fstatsig&env=FLAGS_SECRET&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fstatsig%23setup&project-name=flags-sdk-statsig&repository-name=flags-sdk-statsig&products=%5B%7B%22integrationSlug%22%3A%22statsig%22%2C%22productSlug%22%3A%22statsig%22%2C%22type%22%3A%22integration%22%2C%22protocol%22%3A%22experimentation%22%7D%5D)

The Deploy button copies only this folder. It installs published SDK packages and uses the standard Next.js build command.

## Setup

Install the [Statsig integration](https://vercel.com/marketplace/statsig), or use an existing Statsig project.

Create these two entities in your Statsig project:

| Name | Type | Configuration |
| --- | --- | --- |
| `welcome_message` | Dynamic Config | Add a string parameter `message` with the value `Hello from Statsig` to the default value. |
| `show_banner` | Feature Gate | Add a rule that passes for everyone (100%). |

Copy `.env.example` to `.env.local` and set:

- `STATSIG_SERVER_API_KEY`: a server secret key from your Statsig project's API Keys settings.
- `FLAGS_SECRET`: generate a random secret with the command below.

Optionally, enable **Global Config Syncing** in the Vercel integration and set both `EXPERIMENTATION_CONFIG` and `EXPERIMENTATION_CONFIG_ITEM_KEY` to use the synced configuration.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

For a linked Vercel project, `vercel env pull` can populate `.env.local`.

The home page uses the Flags SDK's `evaluate()` API to evaluate both flags. Change the dynamic config or feature gate in Statsig and refresh the page after the SDK (or optional Global Config integration) has synced. Every visitor uses the same `demo-user` context; replace `identify` in `flags.ts` to add user targeting.

## Flags Explorer

The example exposes its flag definitions at `/.well-known/vercel/flags`, protected by `FLAGS_SECRET`. The Vercel Toolbar is included during local development; link the project with `vercel link` from this folder and sign in to the toolbar to use Flags Explorer. Vercel injects the toolbar on preview deployments when enabled in project settings.

Open Flags Explorer in the toolbar to override `welcome_message` or `show_banner` for your session without changing the values in Statsig. Use the same `FLAGS_SECRET` in your local environment and the linked Vercel project.

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

The root `pnpm-workspace.yaml` overrides this example's `flags` and `@flags-sdk/statsig` dependencies to `workspace:*`. Explicit task dependencies in the root `turbo.json` ensure Turbo builds the local SDK and adapter before starting Next.js, since Turbo does not infer workspace links from pnpm overrides.

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

When cloned independently, the root overrides are absent and the regular versions in `package.json` resolve from npm. No workspace files, shared TypeScript configuration, or build scripts are needed for the standalone app.
