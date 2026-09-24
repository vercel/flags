# Flags SDK + GrowthBook

A minimal Next.js App Router example with two server-evaluated flags.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fgrowthbook&env=GROWTHBOOK_CLIENT_KEY,GROWTHBOOK_API_KEY,FLAGS_SECRET&envDescription=Use%20your%20GrowthBook%20SDK%20client%20key%20and%20a%20random%2032-byte%20base64url%20FLAGS_SECRET.&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fflags%2Ftree%2Fmain%2Fexamples%2Fproviders%2Fgrowthbook%23setup&project-name=flags-sdk-growthbook&repository-name=flags-sdk-growthbook)

The Deploy button copies only this folder. It installs published SDK packages and uses the standard Next.js build command.

## Setup

Create these features in GrowthBook and include them in your SDK connection:

| Feature key | Type | Default value |
| --- | --- | --- |
| `welcome_message` | String | `Hello from GrowthBook` |
| `show_banner` | Boolean | `true` |

Copy `.env.example` to `.env.local` and set `GROWTHBOOK_CLIENT_KEY` to your SDK connection's client key. Generate `FLAGS_SECRET` with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The home page uses the Flags SDK's `evaluate()` API to evaluate both flags. Change their values in GrowthBook and refresh the page after the SDK's feature cache updates. Every visitor uses the same `demo-user` context; replace `identify` in `flags.ts` to add user targeting.

## Flags Explorer

The discovery endpoint at `/.well-known/vercel/flags` loads flag metadata from GrowthBook using `getProviderData` from `@flags-sdk/growthbook`, protected by `FLAGS_SECRET`. The page reports evaluated values to the toolbar.

Set `GROWTHBOOK_API_KEY` to a GrowthBook API key or personal access token with read access to features. This is separate from `GROWTHBOOK_CLIENT_KEY`. Discovery filters metadata to your SDK connection. For self-hosted GrowthBook, set `GROWTHBOOK_API_HOST` for SDK evaluation, `GROWTHBOOK_APP_API_HOST` for the management API, and `GROWTHBOOK_APP_ORIGIN` for dashboard links.

The Vercel Toolbar is included during local development. Link this folder with `vercel link` and add the same `FLAGS_SECRET` to the linked project's Development environment as a regular environment variable (Config). Alternatively, pull an existing value with `vercel env pull .env.local`. Restart the dev server after linking.

Sign in to the toolbar and open Flags Explorer to override the greeting or banner for your session. Vercel injects the toolbar on preview deployments when enabled in project settings; configure the credentials and a matching `FLAGS_SECRET` for that environment.

## Run as a standalone project

Copy this folder or use the Deploy button, configure `.env.local`, then run:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. For a production build, run `pnpm build` and `pnpm start`. Node.js 22 or newer is recommended.

## Run inside the Flags SDK repository

Configure `examples/providers/growthbook/.env.local`, then from the repository root:

```sh
pnpm install
pnpm exec turbo run dev --filter=flags-sdk-growthbook
```

The root `pnpm-workspace.yaml` overrides this example's `flags` and `@flags-sdk/growthbook` dependencies to `workspace:*`. Explicit dependencies in `turbo.json` build the local SDK and adapter before starting Next.js.

To build this example and its dependencies:

```sh
pnpm exec turbo run build --filter=flags-sdk-growthbook
pnpm --filter flags-sdk-growthbook start
```

To deploy the workspace version on Vercel:

1. Import the full Flags SDK repository and set **Root Directory** to `examples/providers/growthbook`.
2. Enable **Include source files outside of the Root Directory in the Build Step**.
3. Set **Install Command** to `cd ../../.. && pnpm install --frozen-lockfile`.
4. Set **Build Command** to `cd ../../.. && pnpm exec turbo run build --filter=flags-sdk-growthbook`.
5. Add the environment variables from Setup.

When cloned independently, the root overrides are absent and the regular versions in `package.json` resolve from npm. No workspace files, shared TypeScript configuration, or build scripts are needed for the standalone app.
