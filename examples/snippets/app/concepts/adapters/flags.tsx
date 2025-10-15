import { flag } from 'flags/next';
import { createEdgeConfigAdapter } from './edge-config-adapter';

const edgeConfigAdapter = createEdgeConfigAdapter(process.env.EDGE_CONFIG!);

export const customAdapterFlag = flag<boolean>({
  key: 'custom-adapter-flag',
  description: 'Shows how to use a custom flags adapter',
  adapter: edgeConfigAdapter(),
});
