import type { CatalogLoader } from 'flags';
import { shopFlags } from './definitions.ts';

// The catalog: the flags of the source, for the code generation. It runs at
// build time and in development, not in the application.
const loadCatalog: CatalogLoader = async () => ({
  flags: {
    'summer-sale': {
      variants: Object.values(shopFlags['summer-sale'].variants),
      description: 'The summer sale banner',
    },
    checkout: {
      variants: Object.values(shopFlags.checkout.variants),
      description: 'The checkout flow',
    },
  },
});

export default loadCatalog;
