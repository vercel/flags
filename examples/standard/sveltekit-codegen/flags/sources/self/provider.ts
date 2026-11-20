import type { EvaluationContext } from '@openfeature/server-sdk';
import { TypedInMemoryProvider } from '@openfeature/server-sdk';

// Any OpenFeature provider works. This one keeps the flags in memory.
export default new TypedInMemoryProvider({
  enableSale: {
    variants: { on: true, off: false },
    defaultVariant: 'off',
    disabled: false,
    contextEvaluator: (context: EvaluationContext) =>
      context.user === 'alice' ? 'on' : 'off',
  },
});
