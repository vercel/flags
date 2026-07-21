---
"@flags-sdk/posthog": major
---

Make local vs. remote flag evaluation an explicit choice.

Previously the default `postHogAdapter` passed `POSTHOG_PERSONAL_API_KEY` into the
runtime `posthog-node` client, which enabled local evaluation and started a
feature-flag poller in every warm server process. On serverless this could generate
a large, traffic-independent volume of PostHog feature flag requests.

The default adapter now evaluates flags remotely unless you opt in to local
evaluation by setting `POSTHOG_SECRET_KEY` (a `phs_...` project secret key). When set,
`posthog-node` polls flag definitions and evaluates flags in-process. When using
`createPostHogAdapter`, control it explicitly via `postHogOptions`
(`secretKey` + `enableLocalEvaluation`).

`POSTHOG_PERSONAL_API_KEY` continues to be used only by `getProviderData` (Flags
Explorer discovery) and no longer affects runtime evaluation.
