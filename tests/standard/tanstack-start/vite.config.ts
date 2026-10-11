import { flags } from '@flags-sdk/tanstack-start/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The framework binding gives the SDK the request and flags.config.ts.
  // The plugin also registers 'use flags' modules and writes the manifest.
  plugins: [nitro(), tanstackStart(), viteReact(), flags()],
});
