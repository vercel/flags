import { TypedInMemoryProvider } from '@openfeature/server-sdk';

// The OpenFeature provider of the source. Here it is an in-memory provider,
// so the demo needs no account. Any OpenFeature provider works.
export default new TypedInMemoryProvider({
  'summer-sale': {
    variants: { on: true, off: false },
    defaultVariant: 'off',
    disabled: false,
    // On for alice only
    contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
  },
  checkout: {
    variants: { control: 'control', express: 'express' },
    defaultVariant: 'control',
    disabled: false,
    // Express checkout for the beta users
    contextEvaluator: (context) =>
      context.beta === true ? 'express' : 'control',
  },
});
