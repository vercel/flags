import { cookieFlag, exampleFlag, userRoleFlag } from '#flags';

// Example of using precomputed routes in Nuxt
// This middleware will:
// 1. During prerendering: generate all permutations and prerender them
// 2. At runtime: redirect to the appropriate precomputed route
export default defineEventHandler((event) => {
  if (event.path.startsWith('/precompute')) {
    return handlePrecomputedPaths(event, [
      exampleFlag,
      cookieFlag,
      userRoleFlag,
    ]);
  }
});
