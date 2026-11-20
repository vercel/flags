import { TypedInMemoryProvider } from '@openfeature/server-sdk';

export default new TypedInMemoryProvider({
  'hero-text': {
    variants: { welcome: 'Welcome', again: 'Hello again' },
    defaultVariant: 'welcome',
    disabled: false,
    contextEvaluator: (context) =>
      context.returning === true ? 'again' : 'welcome',
  },
});
