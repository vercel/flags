import type { Provider } from 'flags';

// The provider of the generated flags: on for alice only
const provider: Provider = {
  metadata: { name: 'self' },
  resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
    value: context.user === 'alice',
  }),
};

export default provider;
