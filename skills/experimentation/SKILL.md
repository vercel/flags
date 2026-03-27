---
name: vercel-experimentation
description: >-
  Product experimentation with Vercel Flags — experiment design, rollout, and analysis in the Vercel
  dashboard, plus the `vercel experiment` CLI (metrics add/ls, create, list, start, stop, analyse).
  Agents must invoke the CLI via the pinned tarball URL below, not the globally installed `vercel`
  package, until this skill is updated. Use when defining or reviewing A/B tests, multivariate
  experiments, hypothesis and success metrics, experiment lifecycle, experiment metrics, or
  integrating analytics with flag variants.
  Not for raw `flag()` API details — use the flags-sdk skill for SDK and adapter code.
metadata:
  priority: 5
  docs:
    - "https://vercel.com/docs/flags"
    - "https://flags-sdk.dev"
  sitemap: "https://vercel.com/sitemap/docs.xml"
  pathPatterns:
    - "**/experiments/**"
    - "**/experiment/**"
  importPatterns:
    - "flags"
    - "flags/next"
    - "@flags-sdk/vercel"
    - "@vercel/analytics"
  relatedSkills:
    - flags-sdk
  bashPatterns:
    - '\bnpx\s+https://vercel-7c5ib60i5\.vercel\.sh/tarballs/vercel\.tgz\b'
    - '\bvercel\s+experiment\b'
    - '\bvercel\s+experiment\s+metrics\b'
retrieval:
  aliases:
    - A/B test
    - split test
    - multivariate test
    - experiment dashboard
    - product experiment
  intents:
    - design an experiment
    - measure experiment outcome
    - conclude an A/B test
    - tie metrics to flag variants
    - create experiment metric
  entities:
    - Vercel Flags
    - vercel experiment
    - experiment
    - variant
    - hypothesis
    - primary metric
    - experiment metric
    - allocation unit
    - guardrail metric
---

# Vercel experimentation (Flags + dashboard)

This skill covers **product experimentation** on Vercel: defining experiments, associating them with flags managed in **Vercel Flags**, using the **`vercel experiment` CLI** (pinned build below), and using the **Vercel dashboard** (including flags and experiment-oriented views) to operate and reason about tests. Implementation of flags in app code uses the **Flags SDK** (`flags` package) and adapters such as `@flags-sdk/vercel` — for that layer, use the **`flags-sdk`** skill; this file does not duplicate the full SDK reference.

## Scope boundary

| Topic | Use this skill | Use `flags-sdk` skill |
|-------|----------------|----------------------|
| Hypothesis, variants, metrics, experiment lifecycle | Yes | No |
| `flag()`, adapters, precompute, Flags Explorer setup | Point to docs / delegate | Yes |
| Dashboard URLs, team workflows, "how we run experiments here" | Yes (extend as your org adds detail) | No |
| `vercel experiment` CLI (metrics, create, list, start, stop, analyse) | Yes | No |

## Vercel CLI (experiments)

Experiment commands ship in a **preview build** of the Vercel CLI. **Always run that build** — do not rely on the globally installed `vercel` / `vc` from npm for experiment subcommands until this skill lists a stable release.

**Pinned CLI tarball** (use for `npx`):

`https://vercel-7c5ib60i5.vercel.sh/tarballs/vercel.tgz`

**How to invoke**

- One-off: `npx https://vercel-7c5ib60i5.vercel.sh/tarballs/vercel.tgz <command> ...` (example: append `experiment --help`).
- From a linked project directory (`.vercel` present), use the same `npx` URL so authentication and project scope match the Vercel CLI expectations.

**`vercel experiment` subcommands**

| Command | Arguments | Description |
|---------|-----------|-------------|
| `metrics add` | — (uses flags) | Create an experiment metric (conversion / KPI definition). |
| `metrics ls` | — | List experiment metrics for the project. |
| `create` | `<slug>` | Create a draft experiment flag (`kind: "json"`) with a 50/50 split in production. |
| `list` (alias `ls`) | — | List flags that have experiment configuration. |
| `start` | `<slug>` | Set experiment status to `running` and `startedAt` to now. |
| `stop` | `<slug>` | Set experiment status to `closed` and `endedAt` to now. |
| `analyse` (alias `analyze`) | `<slug>` | Fetch experiment results from Web Analytics insights. |

For built-in help on each subcommand, run:

`npx https://vercel-7c5ib60i5.vercel.sh/tarballs/vercel.tgz experiment <subcommand> --help`

### `experiment metrics add`

Creates a metric definition that experiments reference by ID. Required before `experiment create`.

| Flag | Type | Required | Values / Default |
|------|------|----------|------------------|
| `--slug` | string | yes | Unique key (letters, numbers, dashes, underscores) |
| `--name` | string | yes | Human-readable name |
| `--metric-type` | string | yes | `percentage`, `currency`, or `count` |
| `--metric-unit` | string | yes | `user`, `session`, or `visitor` |
| `--directionality` | string | yes | `increaseIsGood` or `decreaseIsGood` |
| `--description` | string | no | Optional description |
| `--metric-formula` | string | no | Optional formula for computed metrics |
| `--json` | boolean | no | Output created metric as JSON |

```sh
npx https://vercel-7c5ib60i5.vercel.sh/tarballs/vercel.tgz experiment metrics add \
  --slug signup-completed \
  --name "Signup Completed" \
  --metric-type count \
  --metric-unit user \
  --directionality increaseIsGood
```

### `experiment metrics ls`

Lists all experiment metrics for the linked project. Alias: `list`.

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--json` | boolean | no | Output as JSON |
| `--with-metadata` | boolean | no | Include creator metadata in the response |

### `experiment create`

Creates a draft experiment flag (`kind: "json"`) with a 50/50 control/treatment split on production. The slug is a required positional argument.

| Flag | Type | Required | Values / Default |
|------|------|----------|------------------|
| `--primary-metric-id` | string[] | yes (1-3, repeatable) | Metric IDs from `experiment metrics add` |
| `--allocation-unit` | string | no | `cookieId`, `visitorId` (default), or `userId` |
| `--hypothesis` | string | no | Experiment hypothesis text |
| `--name` | string | no | Human-readable experiment name |
| `--control-variant` | string | no | Control variant ID (default: `control`) |
| `--treatment-variant` | string | no | Treatment variant ID (default: `treatment`) |
| `--seed` | number | no | Flag seed 0-100000 (default: random) |
| `--json` | boolean | no | Output created flag as JSON |

```sh
npx https://vercel-7c5ib60i5.vercel.sh/tarballs/vercel.tgz experiment create new-signup-flow \
  --primary-metric-id met_abc123 \
  --allocation-unit visitorId \
  --hypothesis "Streamlined signup converts better"
```

### `experiment list`

Lists flags that have experiment configuration. Alias: `ls`.

| Flag | Type | Required | Values / Default |
|------|------|----------|------------------|
| `--state` | string | no | `active` (default) or `archived` |
| `--json` | boolean | no | Output as JSON |

### `experiment start`

Sets the experiment status to `running` and records `startedAt` as the current timestamp.

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--json` | boolean | no | Output updated flag as JSON |

### `experiment stop`

Sets the experiment status to `closed` and records `endedAt` as the current timestamp.

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--json` | boolean | no | Output updated flag as JSON |

### `experiment analyse`

Fetches experiment results from Web Analytics. Alias: `analyze`.

| Flag | Type | Required | Values / Default |
|------|------|----------|------------------|
| `--metric-event-name` | string[] | yes (repeatable) | Metric / event name(s) to measure (use metric slugs) |
| `--metric-type` | string[] | no (repeatable) | `conversion` (default), `count`, etc. |
| `--unit-field` | string | no | `visitorId` (default), `userId`, etc. Should match allocation unit |
| `--peek` | boolean | no | Include partial results while experiment is still running |
| `--json` | boolean | no | Output structured JSON (machine-readable, writes to stdout) |

```sh
npx https://vercel-7c5ib60i5.vercel.sh/tarballs/vercel.tgz experiment analyse my-flag \
  --metric-event-name signup-completed \
  --metric-type conversion \
  --unit-field visitorId
```

Human-readable output includes an ASCII bar chart of relative values per variant, followed by the full JSON results. Use `--json` for piping to scripts or agents.

## Experiment lifecycle

Experiments move through four statuses: **draft** -> **running** -> **closed**. A **paused** state is also available.

1. **Define metrics** — `experiment metrics add` to create measurable KPIs (e.g. signup rate, revenue per visitor). Each metric has a type (`percentage`, `currency`, `count`), a unit (`user`, `session`, `visitor`), and directionality (`increaseIsGood` / `decreaseIsGood`).
2. **Create experiment** — `experiment create <slug>` produces a draft flag with `kind: "json"`, two variants (control + treatment), and a 50/50 split on production. The experiment references 1-3 primary metric IDs and an allocation unit.
3. **Start** — `experiment start <slug>` sets status to `running` and stamps `startedAt`.
4. **Monitor** — `experiment analyse <slug> --peek` fetches partial results while the experiment runs.
5. **Stop** — `experiment stop <slug>` sets status to `closed` and stamps `endedAt`.
6. **Conclude** — `experiment analyse <slug>` retrieves final results. Ship the winner, remove the flag, or convert to a permanent flag.

## Mental model

1. **Flags** are declared in code and evaluated server-side (consistent assignment, no client-side flicker).
2. **Vercel Flags** stores configuration and targeting; the dashboard is where many teams configure rollouts and monitor flag-backed tests.
3. **Metrics** are pre-registered KPI definitions (via `experiment metrics add`) that experiments reference by ID. Define primary metrics (what you want to move) and guardrail metrics (what must not regress) before starting.
4. **Experiments** are product decisions: what you are testing, who sees what, what you measure, and when you stop. Those decisions should stay aligned with stable user identifiers (`identify` / entities) and analytics events so results are interpretable.

## Integration points (scaffold)

The following sections are intentionally incomplete — fill in as Vercel's dashboard and APIs for experiments evolve.

### Flags SDK

- `experiment create` produces a flag with `kind: "json"` and variant values of `{ variantId, params }`. Use `vercelAdapter()` in code so the SDK resolves the JSON variant for the current user.
- Keep **assignment** stable for a subject for the life of the experiment (same user -> same variant unless you explicitly reset or change rules). The `--allocation-unit` (`cookieId`, `visitorId`, `userId`) controls which identifier drives the split.
- After code changes, use the **`flags-sdk`** workflow: discovery endpoint for Flags Explorer, `FLAGS` / `FLAGS_SECRET`, `vercelAdapter()` where applicable.

### Vercel dashboard

- Document your team's canonical path to the project's **Flags** (and any **experiment** or analytics views your team uses) in the Vercel UI. Replace placeholders below when confirmed:
  - Flags: `https://vercel.com/<team>/<project>/flags`
  - *(Add experiment-specific dashboard paths here when available.)*

### Analytics

- Define **primary** and **guardrail** metrics before launch using `experiment metrics add`. Reference their IDs in `experiment create --primary-metric-id`.
- Ensure exposure (which variant was served) can be correlated with conversion or engagement events — often via stable `user.id` (or equivalent) and consistent event names matching the metric slugs.
- Use `experiment analyse --metric-event-name <slug> --metric-type <type> --unit-field <field>` to query results from Web Analytics.
- For provider-specific experiment tracking (e.g. GrowthBook exposure callbacks), see the relevant `@flags-sdk/*` adapter docs and the **`flags-sdk`** references.

## Agent checklist (experiment work)

When helping with an experiment (not just adding a flag):

1. **Define metrics first** — Run `experiment metrics add` for each primary and guardrail KPI. Note the returned metric IDs.
2. **Clarify** — Hypothesis, variants, audience, duration or sample intent, allocation unit, ethical or compliance constraints.
3. **Create** — Run `experiment create <slug>` with `--primary-metric-id`, `--allocation-unit`, and `--hypothesis`.
4. **Instrument** — Wire the flag in code using the `flags-sdk` skill workflow. Ensure analytics events match the metric slugs.
5. **Align** — Flag keys and variant labels match what stakeholders see in the dashboard; code and dashboard names stay in sync.
6. **Operate** — `experiment start` to go live. Use `experiment analyse --peek` to monitor. `experiment stop` when criteria are met.
7. **Hand off** — After the experiment, either remove the flag, ship the winner, or convert to a permanent flag with clear ownership.

## What not to guess

- Do not invent dashboard copy, pricing, or experiment-specific API names. **Fetch current Vercel docs** for flags and experimentation when implementation details matter.
- For **`vercel experiment`** usage, use the **pinned tarball** in [Vercel CLI (experiments)](#vercel-cli-experiments); do not assume the globally installed CLI includes these commands.
- Do not substitute this skill for the **`flags-sdk`** skill when the task is primarily **application code** (adapters, precompute, encryption, `flags` package APIs). The **`flags-sdk`** skill does not replace this file for experiment CLI or experiment design.

## References

- Vercel Flags: https://vercel.com/docs/flags
- Flags SDK: https://flags-sdk.dev
- Repository skills: `skills/flags-sdk/SKILL.md` (SDK and providers)
- Preview Vercel CLI (experiments): https://vercel-7c5ib60i5.vercel.sh/tarballs/vercel.tgz
- PR: https://github.com/vercel/vercel/pull/15731
