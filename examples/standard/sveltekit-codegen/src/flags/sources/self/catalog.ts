import type { CatalogLoader } from 'flags';

// The flags of the source, for the code generation. A real catalog loads
// them from the flag management system.
const loadCatalog: CatalogLoader = () => ({
  flags: {
    enableSale: {
      variants: [false, true],
      description: 'Shows the summer sale',
      defaultValue: false,
    },
  },
});

export default loadCatalog;
