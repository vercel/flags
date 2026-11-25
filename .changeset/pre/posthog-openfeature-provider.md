---
'@flags-sdk/posthog': minor
---

Add `@flags-sdk/posthog/openfeature`, an OpenFeature server provider for PostHog. `new PostHogProvider(client, options?)` takes a PostHog client of `posthog-node` 5 or 6, which the application creates. A boolean flag reads whether the flag is enabled, a string flag reads the variant key, and number and object flags read the JSON payload. The `targetingKey` of the evaluation context is the distinct ID. `track` sends an event with `capture`. The provider does not import `flags`.
