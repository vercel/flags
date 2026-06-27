import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { precomputeMarketing } from '../precomputed-flags';

// Precompute the marketing flags into a signed code, then redirect to the
// precomputed route. The same code can be cached/served statically.
const getMarketingCode = createServerFn().handler(async () => {
  const request = getRequest();
  return precomputeMarketing(request);
});

export const Route = createFileRoute('/marketing')({
  loader: async () => {
    const code = await getMarketingCode();
    throw redirect({ to: '/marketing/$code', params: { code } });
  },
  component: () => null,
});
