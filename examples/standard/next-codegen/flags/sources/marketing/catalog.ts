import type { CatalogLoader } from 'flags';

// A second source, e.g. a different flag management system
const loadCatalog: CatalogLoader = () => ({
  flags: {
    'hero-text': {
      variants: ['Welcome', 'Hello again'],
      description: 'The text of the hero section',
    },
  },
});

export default loadCatalog;
