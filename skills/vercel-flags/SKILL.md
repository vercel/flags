---
name: vercel-flags
description: >
  Feature flags, A/B tests, and gradual rollouts with Vercel Flags, in any app or framework.
  Use whenever the user is planning, adding, or changing a feature flag, toggle, kill switch,
  experiment, percentage rollout, or targeting rule, or wants to gate or hide a feature for some
  users, even before a library or provider is chosen. Covers choosing an integration (Flags SDK,
  `@vercel/flags-core`, OpenFeature), the Vercel dashboard, the `vercel flags` CLI (create, inspect,
  set, split, rollout, rules, segments, evaluations, archive), OIDC vs SDK keys, `FLAGS_SECRET`, and
  Flags Explorer overrides. For `flag()` declarations, adapters, precompute, and the Flags Explorer
  endpoint in Next.js or SvelteKit code, load the `flags-sdk` skill.
---

# Vercel Flags

Vercel Flags is Vercel's feature flags platform. Flags are created and managed in the Vercel dashboard or with the `vercel flags` CLI, evaluated server-side in your app, and switched per environment (Development, Preview, Production) without a redeploy.

- Docs: https://vercel.com/docs/flags
- CLI reference: https://vercel.com/docs/cli/flags

Use this skill to decide how a feature should be flagged, to create and change flags, and to run rollouts and experiments. Write app code with the skill that matches the stack (see [Choose an approach](#choose-an-approach)). Do not leave CLI steps as "next steps" for the user; execute them yourself.

## Route the request

- **Planning** ("put this behind a flag", "roll this out to 10%", "A/B test the pricing page", "add a kill switch"): follow [Plan a flag](#plan-a-flag), then [Choose an approach](#choose-an-approach).
- **Create or manage a flag with no code change** (create, inspect, enable, set, split, rollout, rules, archive): follow [Manage flags with the CLI](#manage-flags-with-the-cli). This needs an authenticated CLI, not SDK packages, Toolbar, Flags Explorer, or `.env.local` (except `vercel flags override`, which reads `FLAGS_SECRET`).
- **Add a flag to an app that already uses the Flags SDK** (`flags` in `package.json`): load the `flags-sdk` skill right away; it creates the flag on Vercel and declares it in code.
- **Implement in code otherwise**: follow [Choose an approach](#choose-an-approach) and load the matching skill or reference. Inside an app repository, treat an ambiguous request as plan, create, and implement.

## Choose an approach

Check the project before writing code.

- **Already using another flag provider** (Statsig, LaunchDarkly, PostHog, GrowthBook, and so on): keep it. On Next.js or SvelteKit, the Flags SDK connects to it through an adapter; load the `flags-sdk` skill. On any other stack, use the provider's own SDK. Rollouts, targeting, and experiments for that provider are configured in its own dashboard, not with `vercel flags`; the CLI and lifecycle sections of this skill do not apply.
- **No provider yet**: use Vercel Flags. Pick the integration by stack ([SDKs](https://vercel.com/docs/flags/vercel-flags/sdks)):
  - **Next.js or SvelteKit**: the Flags SDK (`flags` + `@flags-sdk/vercel`). It adds Flags Explorer integration and precompute for static pages. Load the `flags-sdk` skill. If it is not available, suggest `npx skills add vercel/flags@flags-sdk` (do not auto-install).
  - **Any other framework or a plain server** (for example Express): `@vercel/flags-core`. See [Other frameworks](#other-frameworks).
  - **The user wants provider portability or already uses OpenFeature**: the Vercel Flags OpenFeature provider ([Using OpenFeature with Vercel Flags](https://vercel.com/docs/flags/vercel-flags/sdks/openfeature)).

The dashboard and the `vercel flags` CLI work the same for every integration.

## Plan a flag

Decide these before creating the flag; the kind cannot be changed later.

- **Kind**: `boolean` for on/off and kill switches; `string`, `number`, or `json` when the flag selects a variant or carries configuration ([Flag types](https://vercel.com/docs/flags/vercel-flags/dashboard/feature-flag#flag-types)).
- **Variants**: name them after the behavior (`control`, `new-checkout`), not after the rollout step.
- **Key**: kebab-case, stable, and the same string in the CLI, the dashboard, and the code (`key` in `flag()` or the first argument of `evaluate()`).
- **Environments**: each environment serves its own value or targeting. Plan what Development, Preview, and Production serve at launch.
- **Targeting**: a percentage rollout or A/B split needs a stable identity to bucket by, such as `user.id`. Define the entity and attribute under Flags → Entities first; the app must return the same names from its evaluation context ([Entities](https://vercel.com/docs/flags/vercel-flags/dashboard/entities)).
- **Fallback**: the value the app serves when the flag is archived, not yet created, or evaluation fails. This becomes `defaultValue` in code.
- **Exit**: a flag is temporary unless it is a long-lived operational switch. Plan the removal order in [references/cli.md — Lifecycle and safety](references/cli.md#lifecycle-and-safety).

## Manage flags with the CLI

The CLI uses your Vercel account authentication. SDK keys and `vercel env pull` are application credentials, not CLI prerequisites.

> **Prerequisite**: The Vercel CLI must be installed and authenticated. If it is not installed, run `pnpm i -g vercel`. For authentication or linking issues, follow the `vercel-cli` skill if it is available. If it is not, suggest `npx skills add vercel/vercel@vercel-cli` (do not auto-install it) and rely on `vercel <command> --help` in the meantime.

Run `vercel flags --help` for the current subcommand list and `vercel flags <cmd> --help` before using a subcommand. [references/cli.md](references/cli.md) covers what `--help` cannot: how CLI concepts map to the app, promotion order, static value vs targeting mode, and the checks to run before archiving or deleting.

### Project targeting

Use `--project <name-or-id>` and `--scope <team>` to select the target without a local link. If the CLI rejects `--project`, upgrade it first (`pnpm i -g vercel`). Without these options the commands use the linked project: run `vercel project inspect --non-interactive` and check the reported owner and project name; a `.vercel/` directory alone does not prove a link. If it reports `link_required`, the project is not linked. If the user named a project or team and the output differs, stop and ask instead of relinking. In an unlinked directory, prefer `--project` / `--scope` over `vercel link`; if the target project is unknown, ask.

### Common flows

Always `inspect` first so you know what each environment serves today, and match the CLI key to the flag the application already declares; creating a second flag is not a substitute for adopting an existing one.

- **Create**: `vercel flags create <key> --kind boolean --description "<description>"`. If the key exists, adopt it instead.
- **Turn on or off**: `enable` / `disable` for boolean flags, `set <key>` to serve one variant of any kind. These put the environment in static value mode.
- **Gradual rollout**: `rollout <key> --by user.id ...` ([Roll out a feature](https://vercel.com/docs/flags/vercel-flags/cli/roll-out-feature)).
- **A/B test**: `split <key> --by user.id ...` ([Run an A/B test](https://vercel.com/docs/flags/vercel-flags/cli/run-ab-test)).
- **Targeting rules and segments**: `rules`, `segments`, and `use-targeting <key>` to switch an environment from a static value back to targets and rules.
- **Verify**: `inspect` for the served state, `versions` for history, `evaluations` to confirm traffic reaches the new variant.
- **Retire**: remove the code first, verify no evaluations, then `archive`; `rm` only for archived flags. Follow [Lifecycle and safety](references/cli.md#lifecycle-and-safety).

`archive`, `unarchive`, `rm`, and `update --remove-variant` prompt for confirmation. Pass `--yes` when the user has approved the action.

## Credentials

- **OIDC**: on Vercel, the app authenticates with the project's OIDC token and evaluates the configuration of the current environment. `vercel env pull` writes the Development token to `.env.local` for local development ([Getting started](https://vercel.com/docs/flags/vercel-flags/quickstart#pull-local-openid-connect-credentials)).
- **SDK keys (`FLAGS`)**: only for apps outside Vercel, custom environments, or flags owned by another project. Each key is scoped to one environment and shown once, at creation ([SDK Keys](https://vercel.com/docs/flags/vercel-flags/dashboard/sdk-keys)). Not a recovery path for failed CLI authentication.
- **`FLAGS_SECRET`**: created per environment when Vercel Flags is activated for a project. It signs Flags Explorer overrides and precompute codes, and `vercel flags override` reads it from the environment or `.env.local`. Preserve existing values and never rotate them as part of routine setup; a missing local value does not mean the remote value is missing, so check the target environment before generating one. The `flags-sdk` skill documents how to generate a missing value. Do not print secrets to the terminal, logs, or chat.

## Flags Explorer

Flags Explorer is the Vercel Toolbar panel that lists the app's flags and lets you override them per browser through a cookie signed with `FLAGS_SECRET` ([Flags Explorer](https://vercel.com/docs/flags/flags-explorer)). The app exposes its flags through a discovery endpoint; the Flags SDK generates it (`flags-sdk` skill). `vercel flags override <key>=<value>` produces the same cookie token from the terminal.

## Other frameworks

For frameworks without a Flags SDK entrypoint, use `@vercel/flags-core` directly ([Core SDK](https://vercel.com/docs/flags/vercel-flags/sdks/core)). Create one client at module scope and call `evaluate()` or `bulkEvaluate()` inside a request handler; both initialize the client on first use. Do not add a module-scope `client.initialize()` call or cache its promise for handlers to await.

```ts
// src/flags.ts
import { createClient } from '@vercel/flags-core';

const client = createClient();

// Call from a request handler, not during module loading.
export async function showNewCheckout(userId: string): Promise<boolean> {
  const result = await client.evaluate<boolean>('new-checkout', false, {
    user: { id: userId },
  });
  return result.value;
}
```

With OIDC the token can come from request context and may not exist during module loading. Even embedded definitions need it to select the entry by the token's `project_id`, and local `.env.local` credentials can hide this timing problem. Explicit initialization is optional and must wait until authentication is available; awaiting an already-started initialization promise later does not move it into request context. Outside Vercel, pass the SDK key: `createClient(process.env.FLAGS)`.

The third argument to `evaluate()` is the evaluation context; its entity and attribute names must match the ones defined under Flags → Entities so rollouts and rules can bucket on them.

## References

- **[references/cli.md](references/cli.md)**: how `vercel flags` concepts map to the app (key, kind, variants, fallback, targeting attributes, timestamp conditions, authentication, overrides, embedded definitions), and the lifecycle and safety checklist for promoting, verifying, removing, and archiving flags.
