// The default provider of the test deployment platform. The plugin of
// flags/vite replaces flags/default-provider with this module.
export function createDefaultProvider() {
  return {
    metadata: { name: 'test-platform' },
    resolveBooleanEvaluation: async () => ({ value: true }),
  };
}
