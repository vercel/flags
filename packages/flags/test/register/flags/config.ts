import { defineConfig } from 'flags';

// The pattern of flags/config.ts: optional settings for all flags, e.g. hooks
export const config = defineConfig({
  hooks: [
    {
      after: (hookContext, details) => {
        console.log(`${hookContext.flagKey}=${String(details.value)}`);
      },
    },
  ],
});

// The configuration has no default source: each flag names its source
defineConfig({
  // @ts-expect-error defaultSource is removed
  defaultSource: {},
});
