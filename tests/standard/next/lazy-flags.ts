'use flags';

import { defineConnection } from 'flags';

// A plain flag object, not a flag of defineFlag. Only the registration of
// the 'use flags' module, which withFlags injects, registers its connection.
const lazy = defineConnection({
  provider: {
    metadata: { name: 'lazy' },
    resolveBooleanEvaluation: async () => ({ value: true }),
  },
  project: { system: 'in-memory' },
});

export const plainFlag = { key: 'plain-flag', connection: lazy };
