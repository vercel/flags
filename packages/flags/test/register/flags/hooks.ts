import type { Hook } from 'flags';

// The pattern of flags/hooks.ts: hooks for all flags, as its default export
const hooks: Hook[] = [
  {
    after: (hookContext, details) => {
      console.log(`${hookContext.flagKey}=${String(details.value)}`);
    },
  },
];

export default hooks;
