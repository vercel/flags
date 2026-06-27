import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { flag } from 'flags/tanstack-start';

/**
 * A simple boolean flag driven by a cookie.
 *
 * Toggle it by setting a `showNewDashboard=true` cookie (e.g. via the Vercel
 * Toolbar overrides, or `document.cookie = 'showNewDashboard=true'`).
 */
export const showNewDashboard = flag<boolean>({
  key: 'showNewDashboard',
  description: 'Show the new dashboard',
  options: [{ value: true }, { value: false }],
  decide({ cookies }) {
    return cookies.get('showNewDashboard')?.value === 'true';
  },
});

interface Entities {
  visitorId?: string;
}

/**
 * Establishes the entities the marketing flags decide on. In a real app the
 * `visitorId` would be set by middleware; here we fall back to a stable demo id
 * so the example works without any extra setup.
 */
function identify({
  cookies,
  headers,
}: {
  cookies: ReadonlyRequestCookies;
  headers: ReadonlyHeaders;
}): Entities {
  const visitorId =
    cookies.get('visitorId')?.value ??
    headers.get('x-visitor-id') ??
    'demo-visitor';

  return { visitorId };
}

export const firstMarketingABTest = flag<boolean, Entities>({
  key: 'firstMarketingABTest',
  description: 'Example of a precomputed flag',
  identify,
  decide({ entities }) {
    if (!entities?.visitorId) return false;
    // Any deterministic function of the visitorId works here.
    return /^[a-m0-4]/i.test(entities.visitorId);
  },
});

export const secondMarketingABTest = flag<boolean, Entities>({
  key: 'secondMarketingABTest',
  description: 'Example of a precomputed flag',
  identify,
  decide({ entities }) {
    if (!entities?.visitorId) return false;
    return /[a-m0-4]$/i.test(entities.visitorId);
  },
});
