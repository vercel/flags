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
    - '\bnpx\s+https://vercel-oqugnhev7\.vercel\.sh/tarballs/vercel\.tgz\b'
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

| Topic                                                                 | Use this skill                       | Use `flags-sdk` skill |
| --------------------------------------------------------------------- | ------------------------------------ | --------------------- |
| Hypothesis, variants, metrics, experiment lifecycle                   | Yes                                  | No                    |
| `flag()`, adapters, precompute, Flags Explorer setup                  | Point to docs / delegate             | Yes                   |
| Dashboard URLs, team workflows, "how we run experiments here"         | Yes (extend as your org adds detail) | No                    |
| `vercel experiment` CLI (metrics, create, list, start, stop, analyse) | Yes                                  | No                    |

## Vercel CLI (experiments)

Experiment commands ship in a **preview build** of the Vercel CLI. **Always run that build** — do not rely on the globally installed `vercel` / `vc` from npm for experiment subcommands until this skill lists a stable release.

**Pinned CLI tarball** (use for `npx`):

`https://vercel-oqugnhev7.vercel.sh/tarballs/vercel.tgz`

**How to invoke**

- One-off: `npx https://vercel-oqugnhev7.vercel.sh/tarballs/vercel.tgz <command> ...` (example: append `experiment --help`).
- From a linked project directory (`.vercel` present), use the same `npx` URL so authentication and project scope match the Vercel CLI expectations.

**`vercel experiment` subcommands**

| Command                     | Arguments | Description                                                                                          |
| --------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `create`                    | `<slug>`  | Create a draft experiment flag (`kind: "json"`) with inline metrics and a 50/50 split in production. |
| `metrics add`               | —         | Append a primary or guardrail metric to an existing experiment on a flag.                            |
| `metrics ls`                | `<flag>`  | List primary and guardrail metrics for a flag experiment.                                            |
| `list` (alias `ls`)         | —         | List flags that have experiment configuration.                                                       |
| `start`                     | `<slug>`  | Set experiment status to `running` and `startedAt` to now.                                           |
| `stop`                      | `<slug>`  | Set experiment status to `closed` and `endedAt` to now.                                              |
| `analyse` (alias `analyze`) | `<slug>`  | Fetch experiment results from Web Analytics insights.                                                |

For built-in help on each subcommand, run:

`npx https://vercel-oqugnhev7.vercel.sh/tarballs/vercel.tgz experiment <subcommand> --help`

### `experiment create`

Creates a draft experiment flag (`kind: "json"`) with a 50/50 control/treatment split on production. The slug is a required positional argument. Primary metrics are defined **inline** via `--metric` JSON — no need to create metrics separately beforehand.

| Flag                  | Type    | Required              | Values / Default                               |
| --------------------- | ------- | --------------------- | ---------------------------------------------- |
| `--metric`            | JSON[]  | yes (1-3, repeatable) | Inline metric as JSON (see schema below)       |
| `--allocation-unit`   | string  | no                    | `cookieId`, `visitorId` (default), or `userId` |
| `--hypothesis`        | string  | no                    | Experiment hypothesis text                     |
| `--name`              | string  | no                    | Human-readable experiment name                 |
| `--control-variant`   | string  | no                    | Control variant ID (default: `control`)        |
| `--treatment-variant` | string  | no                    | Treatment variant ID (default: `treatment`)    |
| `--seed`              | number  | no                    | Flag seed 0-100000 (default: random)           |
| `--json`              | boolean | no                    | Output created flag as JSON                    |

**`--metric` JSON schema** — each metric object must include `name`, `metricType`, `metricUnit`, and `directionality`. Optional fields: `description`, `metricFormula`.

| Field            | Type   | Required | Values                                |
| ---------------- | ------ | -------- | ------------------------------------- |
| `name`           | string | yes      | Human-readable metric name            |
| `metricType`     | string | yes      | `percentage`, `currency`, or `count`  |
| `metricUnit`     | string | yes      | `user`, `session`, or `visitor`       |
| `directionality` | string | yes      | `increaseIsGood` or `decreaseIsGood`  |
| `description`    | string | no       | Optional description                  |
| `metricFormula`  | string | no       | Optional formula for computed metrics |

```sh
npx https://vercel-oqugnhev7.vercel.sh/tarballs/vercel.tgz experiment create new-signup-flow \
  --metric '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}' \
  --allocation-unit visitorId \
  --hypothesis "Streamlined signup converts better"
```

### `experiment metrics add`

Appends a primary or guardrail metric to an **existing** experiment on a flag. Use this to add additional metrics after `experiment create`, not as a prerequisite.

| Flag               | Type    | Required | Values / Default                                           |
| ------------------ | ------- | -------- | ---------------------------------------------------------- |
| `--flag`           | string  | yes      | Feature flag slug whose experiment receives this metric    |
| `--name`           | string  | yes      | Human-readable metric name                                 |
| `--metric-type`    | string  | yes      | `percentage`, `currency`, or `count`                       |
| `--metric-unit`    | string  | yes      | `user`, `session`, or `visitor`                            |
| `--directionality` | string  | yes      | `increaseIsGood` or `decreaseIsGood`                       |
| `--guardrail`      | boolean | no       | Add as guardrail metric (max 2) instead of primary (max 3) |
| `--description`    | string  | no       | Optional description                                       |
| `--metric-formula` | string  | no       | Optional formula for computed metrics                      |
| `--json`           | boolean | no       | Output created metric as JSON                              |

```sh
npx https://vercel-oqugnhev7.vercel.sh/tarballs/vercel.tgz experiment metrics add \
  --flag new-signup-flow \
  --name "Signup Completed" \
  --metric-type count \
  --metric-unit user \
  --directionality increaseIsGood
```

### `experiment metrics ls`

Lists primary and guardrail metrics for a specific flag experiment. Alias: `list`. The flag slug is a required positional argument.

| Flag     | Type    | Required | Description    |
| -------- | ------- | -------- | -------------- |
| `--json` | boolean | no       | Output as JSON |

```sh
npx https://vercel-oqugnhev7.vercel.sh/tarballs/vercel.tgz experiment metrics ls my-exp-flag
```

### `experiment list`

Lists flags that have experiment configuration. Alias: `ls`.

| Flag      | Type    | Required | Values / Default                 |
| --------- | ------- | -------- | -------------------------------- |
| `--state` | string  | no       | `active` (default) or `archived` |
| `--json`  | boolean | no       | Output as JSON                   |

### `experiment start`

Sets the experiment status to `running` and records `startedAt` as the current timestamp.

| Flag     | Type    | Required | Description                 |
| -------- | ------- | -------- | --------------------------- |
| `--json` | boolean | no       | Output updated flag as JSON |

### `experiment stop`

Sets the experiment status to `closed` and records `endedAt` as the current timestamp.

| Flag     | Type    | Required | Description                 |
| -------- | ------- | -------- | --------------------------- |
| `--json` | boolean | no       | Output updated flag as JSON |

### `experiment analyse`

Fetches experiment results from Web Analytics. Alias: `analyze`.

| Flag                  | Type     | Required         | Values / Default                                                   |
| --------------------- | -------- | ---------------- | ------------------------------------------------------------------ |
| `--metric-event-name` | string[] | yes (repeatable) | Metric / event name(s) to measure (use metric slugs)               |
| `--metric-type`       | string[] | no (repeatable)  | `conversion` (default), `count`, etc.                              |
| `--unit-field`        | string   | no               | `visitorId` (default), `userId`, etc. Should match allocation unit |
| `--peek`              | boolean  | no               | Include partial results while experiment is still running          |
| `--json`              | boolean  | no               | Output structured JSON (machine-readable, writes to stdout)        |

```sh
npx https://vercel-oqugnhev7.vercel.sh/tarballs/vercel.tgz experiment analyse my-flag \
  --metric-event-name signup-completed \
  --metric-type conversion \
  --unit-field visitorId
```

Human-readable output includes an ASCII bar chart of relative values per variant, followed by the full JSON results. Use `--json` for piping to scripts or agents.

## Experiment lifecycle

Experiments move through four statuses: **draft** -> **running** -> **closed**. A **paused** state is also available.

1. **Create experiment with metrics** — `experiment create <slug> --metric '<JSON>'` produces a draft flag with `kind: "json"`, two variants (control + treatment), a 50/50 split on production, and 1-3 inline primary metrics. Each metric has a type (`percentage`, `currency`, `count`), a unit (`user`, `session`, `visitor`), and directionality (`increaseIsGood` / `decreaseIsGood`).
2. **Add more metrics (optional)** — `experiment metrics add --flag <slug>` appends additional primary or guardrail metrics to the experiment after creation.
3. **Start** — `experiment start <slug>` sets status to `running` and stamps `startedAt`.
4. **Monitor** — `experiment analyse <slug> --peek` fetches partial results while the experiment runs.
5. **Stop** — `experiment stop <slug>` sets status to `closed` and stamps `endedAt`.
6. **Conclude** — `experiment analyse <slug>` retrieves final results. Ship the winner, remove the flag, or convert to a permanent flag.

## Mental model

1. **Flags** are declared in code and evaluated server-side (consistent assignment, no client-side flicker).
2. **Vercel Flags** stores configuration and targeting; the dashboard is where many teams configure rollouts and monitor flag-backed tests.
3. **Metrics** are KPI definitions created inline during `experiment create` (via `--metric` JSON) or appended afterward with `experiment metrics add --flag`. Primary metrics (what you want to move, max 3) and guardrail metrics (what must not regress, max 2) should be defined before starting.
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
  - _(Add experiment-specific dashboard paths here when available.)_

### Analytics

- Define **primary** metrics inline during `experiment create --metric '<JSON>'`. Add **guardrail** metrics afterward with `experiment metrics add --flag <slug> --guardrail`.
- Ensure exposure (which variant was served) can be correlated with conversion or engagement events — often via stable `user.id` (or equivalent) and consistent event names matching the metric names.
- Use `experiment analyse --metric-event-name <name> --metric-type <type> --unit-field <field>` to query results from Web Analytics.
- For provider-specific experiment tracking (e.g. GrowthBook exposure callbacks), see the relevant `@flags-sdk/*` adapter docs and the **`flags-sdk`** references.

## Agent checklist (experiment work)

When helping with an experiment (not just adding a flag):

1. **Clarify** — Hypothesis, variants, audience, duration or sample intent, allocation unit, primary metrics, ethical or compliance constraints.
2. **Create** — Run `experiment create <slug>` with `--metric '<JSON>'` (1-3 primary metrics inline), `--allocation-unit`, and `--hypothesis`.
3. **Add guardrails (optional)** — Run `experiment metrics add --flag <slug> --guardrail` for any guardrail KPIs (max 2).
4. **Instrument** — Wire the flag in code using the `flags-sdk` skill workflow. Ensure analytics events match the metric names.
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
- Preview Vercel CLI (experiments): https://vercel-oqugnhev7.vercel.sh/tarballs/vercel.tgz
- PR: https://github.com/vercel/vercel/pull/15731
