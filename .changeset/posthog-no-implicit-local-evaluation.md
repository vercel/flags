---
"@flags-sdk/posthog": patch
---

Stop the default `postHogAdapter` from enabling local evaluation when `POSTHOG_PERSONAL_API_KEY` is set.

`POSTHOG_PERSONAL_API_KEY` is only needed for provider data discovery (`getProviderData`), which reads it independently. Passing it into the runtime `posthog-node` client also enabled local evaluation, which starts a per-process feature-flag poller (`featureFlagsPollingInterval: 10_000`). On serverless deployments each warm process ran its own poller, generating large numbers of PostHog feature flag requests unrelated to actual traffic.

The default adapter no longer forwards the personal API key or the polling interval to the runtime client. To use local evaluation, create the adapter explicitly with `createPostHogAdapter` and pass `personalApiKey` and `featureFlagsPollingInterval` in `postHogOptions`.
