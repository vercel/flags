import { createCatalogLoader } from '@vercel/flags-core/catalog';
import type { CatalogLoader } from 'flags';
import { getDemoDescription } from '../../../utils/demo-descriptions';

// The flags of Vercel Flags, with the OIDC token of the project (after
// vercel env pull). The datafile has no descriptions, so the demo adds them.
const loadCatalog: CatalogLoader = createCatalogLoader({
  describe: getDemoDescription,
});

export default loadCatalog;
