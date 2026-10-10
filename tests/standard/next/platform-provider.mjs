// The default provider of the test platform. It replaces flags/default-provider
// and exports the same function.
export function createDefaultProvider() {
  return {
    metadata: { name: 'test-platform' },
    resolveBooleanEvaluation: async () => ({ value: true, reason: 'STATIC' }),
    resolveStringEvaluation: async () => ({
      value: 'From the platform',
      reason: 'STATIC',
    }),
  };
}
