# Flags SDK + Vercel

A minimal Next.js App Router example with two server-evaluated flags, adapted from the [Vercel Flags example](https://github.com/vercel/examples/tree/main/flags-sdk/vercel).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fvercel&env=FLAGS_SECRET&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fvercel%23setup&project-name=flags-sdk-vercel&repository-name=flags-sdk-vercel)

The Deploy button copies only this folder. It installs published SDK packages and uses the standard Next.js build command.

## Setup

In your Vercel project's **Flags** tab, create these flags and configure their values for the environment you are using:

| Flag key | Type | Value |
| --- | --- | --- |
| `welcome_message` | String | `Hello from Vercel` |
| `show_banner` | Boolean | `true` |

Copy `.env.example` to `.env.local` and set:

- `FLAGS`: the Vercel Flags SDK connection string for your project and environment. Link your project with `vercel link` and run `vercel env pull .env.local` to pull it.
- `FLAGS_SECRET`: generate a random secret with the command below, and add it to your project's environment variables and `.env.local`.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The home page uses the Flags SDK's `evaluate()` API to evaluate both flags. Change their values in the Vercel Dashboard and refresh the page. If flags cannot be evaluated, the welcome message falls back to `Welcome to the Vercel example` and the banner stays hidden.

See the [Vercel Flags quickstart](https://vercel.com/docs/flags/vercel-flags/quickstart) for provider setup.

## Run as a standalone project

Copy this folder, or use the Deploy button above. From the copied folder:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. For a production build, run `pnpm build` and `pnpm start`. Node.js 22 or newer is recommended.

## Run inside the Flags SDK repository

Configure `examples/providers/vercel/.env.local` as described above. From the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-vercel
```

The root `pnpm-workspace.yaml` overrides this example's `flags` and `@flags-sdk/vercel` dependencies to `workspace:*`. Explicit task dependencies in the root `turbo.json` ensure Turbo builds the local SDK and adapter before starting Next.js, since Turbo does not infer workspace links from pnpm overrides.

The root `pnpm build` builds only `packages/*`. Use `pnpm build:all` to build the entire workspace, including all examples and apps, after configuring their environments. To build only this example and its dependencies:

```sh
pnpm exec turbo run build --filter=flags-sdk-vercel
pnpm --filter flags-sdk-vercel start
```

To deploy the workspace version on Vercel:

1. Import the full Flags SDK repository and set **Root Directory** to `examples/providers/vercel`.
2. Enable **Include source files outside of the Root Directory in the Build Step**.
3. Set **Install Command** to `cd ../../.. && pnpm install --frozen-lockfile`.
4. Set **Build Command** to `cd ../../.. && pnpm exec turbo run build --filter=flags-sdk-vercel`.
5. Add the environment variables from Setup.

When cloned independently, the root overrides are absent and the regular versions in `package.json` resolve from npm. No workspace files, shared TypeScript configuration, or build scripts are needed for the standalone app.
