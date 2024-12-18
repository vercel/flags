import type { ReadonlyRequestCookies } from '@vercel/flags';
import { dedupe, flag } from '@vercel/flags/next';
import { getOrGenerateVisitorId } from './get-or-generate-visitor-id';

interface Entities {
  visitor?: { id: string };
}

const identify = dedupe(
  async ({
    cookies,
  }: {
    cookies: ReadonlyRequestCookies;
  }): Promise<Entities> => {
    const visitorId = await getOrGenerateVisitorId(cookies);
    return { visitor: visitorId ? { id: visitorId } : undefined };
  },
);

export const marketingAbTest = flag<boolean, Entities>({
  key: 'marketing-ab-test-flag',
  identify,
  description: 'A/B test flag used on the Marketing Pages example',
  decide({ entities }) {
    if (!entities?.visitor) return false;
    // TODO use hashing algorithm?
    return /^[a-n0-5]/i.test(entities.visitor.id);
  },
});

export const secondMarketingAbTest = flag<boolean, Entities>({
  key: 'second-marketing-ab-test-flag',
  identify,
  description: 'A/B test flag used on the Marketing Pages example',
  decide({ entities }) {
    if (!entities?.visitor) return false;
    // TODO use hashing algorithm?
    return /[a-n0-5]$/i.test(entities.visitor.id);
  },
});

export const marketingFlags = [marketingAbTest, secondMarketingAbTest];
