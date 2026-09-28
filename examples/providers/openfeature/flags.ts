import { createOpenFeatureAdapter } from '@flags-sdk/openfeature';
import {
  type EvaluationContext,
  InMemoryProvider,
  OpenFeature,
} from '@openfeature/server-sdk';
import { flag } from 'flags/next';

// Replace InMemoryProvider with your OpenFeature provider for production.
const openFeatureAdapter = createOpenFeatureAdapter(async () => {
  await OpenFeature.setProviderAndWait(
    new InMemoryProvider({
      welcome_message: {
        variants: { greeting: 'Hello from OpenFeature' },
        defaultVariant: 'greeting',
        disabled: false,
      },
      show_banner: {
        variants: { on: true, off: false },
        defaultVariant: 'on',
        disabled: false,
      },
    }),
  );
  return OpenFeature.getClient();
});

// A shared demo context keeps this example focused on flag evaluation.
const identify = (): EvaluationContext => ({ targetingKey: 'demo-user' });

export const welcomeMessage = flag<string, EvaluationContext>({
  key: 'welcome_message',
  description: 'The welcome message shown on the home page.',
  defaultValue: 'Welcome to the OpenFeature example',
  identify,
  adapter: openFeatureAdapter.stringValue(),
});

export const showBanner = flag<boolean, EvaluationContext>({
  key: 'show_banner',
  description: 'Show the promotional banner on the home page.',
  defaultValue: false,
  identify,
  adapter: openFeatureAdapter.booleanValue(),
});
