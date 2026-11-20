'use flags';

import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { defineFlag, defineSource } from 'flags';

// A 'use flags' module exports only flags. withFlags registers them, and
// the discovery endpoint lists them for Flags Explorer.

// The source: an OpenFeature provider, and the function which creates the
// evaluation context from the request. Code generation would write this
// part from flags/sources/<source>, but it can also be written by hand.
const shop = defineSource({
  provider: new TypedInMemoryProvider({
    'summer-sale': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      // On for alice only
      contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
    },
    checkout: {
      variants: {
        control: 'control',
        express: 'express',
        oneClick: 'one-click',
      },
      defaultVariant: 'express',
      disabled: false,
      // one-click was added in the system after the deployment, so the
      // options of the code do not list it
      contextEvaluator: (context) =>
        context.user === 'bob' ? 'oneClick' : 'express',
    },
  } as const),
  project: { system: 'in-memory' },
  getEvaluationContext: (request) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
  }),
});

export const summerSale = shop.bindFlag('summer-sale', {
  description: 'The summer sale banner',
});

export const checkout = shop.bindFlag('checkout', {
  type: 'string',
  options: ['control', 'express'],
  defaultValue: 'control',
  description: 'The checkout flow',
});

// An inline flag: the code decides its value, without a provider
export const betaBanner = defineFlag({
  key: 'beta-banner',
  decide: (request) => request?.cookies?.get('beta')?.value === '1',
  options: [false, true] as const,
  description: 'Shows the beta banner to testers',
});
