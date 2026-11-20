import { defineConfig } from 'flags';

// Optional: settings for all flags
export const config = defineConfig({
  hooks: [
    {
      // Marks each evaluation, so that the tests see that the binding loaded
      // this file
      before: () => ({ fromConfig: true }),
    },
  ],
});
