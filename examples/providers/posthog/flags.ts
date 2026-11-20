'use flags';

import { PostHogProvider } from '@flags-sdk/posthog/openfeature';
import { defineSource } from 'flags';
import { PostHog } from 'posthog-node';

// Local evaluation is optional. With a feature flags secret key (phs_...),
// posthog-node loads the flag definitions and evaluates flags in-process.
const secretKey = process.env.POSTHOG_SECRET_KEY;

// The application creates the PostHog client. Without a project API key, the
// client is disabled and the flags resolve to their default values, so the
// build does not fail.
const posthog = new PostHog(process.env.POSTHOG_PROJECT_API_KEY ?? '', {
  host: process.env.POSTHOG_HOST,
  secretKey,
  enableLocalEvaluation: Boolean(secretKey),
  // The IP address of the server is not the location of the user
  disableGeoip: true,
});

const source = defineSource({
  // The OpenFeature provider of @flags-sdk/posthog. It uses the client above
  // and does not open a connection itself.
  provider: new PostHogProvider(posthog),
  // A shared demo user keeps this example focused on flag evaluation. It runs
  // once per request for all flags of this source. The provider reads
  // `targetingKey` as the distinct ID of PostHog.
  getEvaluationContext: () => ({ targetingKey: 'demo-user' }),
});

// The type `object` reads the JSON payload of the flag. Here it is a string.
export const welcomeMessage = source.bindFlag('welcome_message', {
  type: 'object',
  defaultValue: 'Welcome to the PostHog example',
});

// The type `boolean` reads whether the flag is enabled for the user.
export const showBanner = source.bindFlag('show_banner', {
  defaultValue: false,
});
