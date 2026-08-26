import { flag } from 'flags/next';
import { createGlobalConfigAdapter } from './global-config-adapter';

const globalConfigAdapter = createGlobalConfigAdapter(
  process.env.GLOBAL_CONFIG!,
);

export const customAdapterFlag = flag<boolean>({
  key: 'custom-adapter-flag',
  description: 'Shows how to use a custom flags adapter',
  adapter: globalConfigAdapter,
});
