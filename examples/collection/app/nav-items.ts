interface Item {
  title: string;
  slug: string;
  url: string;
  nav?: 'hidden';
  items?: Item[];
}

export const navItems: Item[] = [
  {
    title: 'Getting Started',
    slug: 'getting-started',
    url: '/',
    items: [
      {
        title: 'Overview',
        slug: 'overview',
        url: '/',
      },
      {
        title: 'Quickstart',
        slug: 'quickstart',
        url: '/getting-started/quickstart',
      },
    ],
  },
  {
    title: 'Philosophy',
    slug: 'philosophy',
    url: '/philosophy',
    items: [
      {
        title: 'Why Feature Flags?',
        slug: 'why-feature-flags',
        url: '/philosophy/why-feature-flags',
        nav: 'hidden',
      },
      {
        title: 'Why Experimentation?',
        slug: 'why-experimentation',
        url: '/philosophy/why-experimentation',
        nav: 'hidden',
      },
      {
        title: 'Flags as Code',
        slug: 'flags-as-code',
        url: '/philosophy/flags-as-code',
      },
      {
        title: 'Server-side vs Client-side',
        slug: 'server-side-vs-client-side',
        url: '/philosophy/server-side-vs-client-side',
      },
      {
        title: 'Data locality',
        slug: 'data-locality',
        url: '/philosophy/data-locality',
      },
    ],
  },
  {
    title: 'Concepts',
    url: '/concepts',
    slug: 'concepts',
    items: [
      {
        title: 'Identify',
        slug: 'identify',
        url: '/concepts/identify',
      },
      {
        title: 'Dedupe',
        slug: 'dedupe',
        url: '/concepts/dedupe',
      },
      {
        title: 'Precompute',
        slug: 'precompute',
        url: '/concepts/precompute',
      },
      {
        title: 'Adapters',
        slug: 'adapters',
        url: '/concepts/adapters',
      },
    ],
  },
  {
    title: 'Examples',
    url: '/examples',
    slug: 'examples',
    items: [
      {
        title: 'Dashboard Pages',
        url: '/examples/dashboard-pages',
        slug: 'dashboard-pages',
      },
      {
        title: 'Marketing Pages',
        url: '/examples/marketing-pages',
        slug: 'marketing-pages',
      },
      {
        title: 'Marketing Pages',
        url: '/examples/feature-flags-in-edge-middleware',
        slug: 'feature-flags-in-edge-middleware',
        nav: 'hidden',
      },
    ],
  },
  // {
  //   title: 'Usage Patterns',
  //   url: '/usage-patterns',
  //   slug: 'usage-patterns',
  //   items: [
  //     {
  //       title: 'Server-side',
  //       url: '/usage-patterns/server-side',
  //       slug: 'server-side',
  //       items: [
  //         {
  //           title: 'React Server Components',
  //           url: '/usage-patterns/server-side/react-server-components',
  //           slug: 'react-server-components',
  //         },
  //       ],
  //       // Server-side usage
  //       // - React Server Components
  //       // - getServerSideProps
  //       // - API Routes (App Router; Pages Router)

  //       // Middleware usage
  //       // - Middleware (separate pages) # section on build time
  //       // - Middleware (precomputed; ISR, dynamic route segment) # section on build time
  //       // - next.config.js rewrites

  //       // Client-side usage
  //       // - Context # any pattern
  //       // - Datafile Injection # not flags SDK
  //     },
  //     {
  //       title: 'Middleware',
  //       slug: 'middleware',
  //       url: '/usage-patterns/middleware',
  //     },
  //     {
  //       title: 'Client-side',
  //       slug: 'client-side',
  //       url: '/usage-patterns/client-side',
  //     },
  //     // {
  //     //   title: 'React Server Components',
  //     //   url: '/usage-patterns/react-server-components',
  //     // },
  //     // {
  //     //   title: 'ISR',
  //     //   url: '/app-router/isr',
  //     // },
  //   ],
  // },
  // {
  //   title: 'Middleware',
  //   url: '#',
  //   items: [
  //     {
  //       title: 'Usage in Middleware',
  //       url: '#',
  //     },
  //     {
  //       title: 'Precomputing',
  //       url: '#',
  //     },
  //   ],
  // },
  // {
  //   title: 'Pages Router',
  //   url: '#',
  //   items: [
  //     {
  //       title: 'getServerSideProps',
  //       url: '#',
  //     },
  //     {
  //       title: 'getStaticProps',
  //       url: '#',
  //     },
  //   ],
  // },
  // {
  //   title: 'Client-Side Usage',
  //   url: '#',
  //   items: [
  //     {
  //       title: 'Middleware',
  //       url: '#',
  //     },
  //     {
  //       title: 'API Endpoints',
  //       url: '#',
  //     },
  //   ],
  // },
  {
    title: 'API Reference',
    slug: 'api-reference',
    url: '/api-reference',
    items: [],
  },

  {
    title: 'Vercel',
    slug: 'vercel',
    url: '/vercel',
    items: [],
  },
];
