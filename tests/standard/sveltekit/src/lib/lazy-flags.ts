'use flags';

import { defineSource } from 'flags';

// A plain flag object, not a flag of bindFlag. Only the registration of
// the 'use flags' module, which the plugin injects, registers its source.
const lazy = defineSource({
  provider: {
    metadata: { name: 'lazy' },
    resolveBooleanEvaluation: async () => ({ value: true }),
  },
  project: { system: 'in-memory' },
});

export const plainFlag = { key: 'plain-flag', source: lazy };
