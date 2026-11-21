import type { Hook } from 'flags';

// Optional: the hooks for all flags, as the default export
const hooks: Hook[] = [
  {
    // Marks each evaluation, so that the tests see that the binding loaded
    // this file
    before: () => ({ fromConfig: true }),
  },
];

export default hooks;
