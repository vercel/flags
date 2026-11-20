import type { CatalogLoader } from 'flags';

// The flags of the source, for the code generation
const loadCatalog: CatalogLoader = () => ({
  flags: { enableSale: { variants: [false, true], defaultValue: false } },
});

export default loadCatalog;
