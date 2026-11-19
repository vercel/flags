import type { EvaluationContext } from '@openfeature/server-sdk';

// Only for this demo: the flags of an in-memory "flag management system".
// A real catalog loads them from the system, e.g. with its API.
export const shopFlags = {
  'summer-sale': {
    variants: { on: true, off: false },
    defaultVariant: 'off',
    disabled: false,
    // On for alice only
    contextEvaluator: (context: EvaluationContext) =>
      context.user === 'alice' ? 'on' : 'off',
  },
  checkout: {
    variants: { control: 'control', express: 'express' },
    defaultVariant: 'express',
    disabled: false,
  },
} as const;
