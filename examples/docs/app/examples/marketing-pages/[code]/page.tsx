import { Content } from '@/components/content';
import {
  marketingAbTest,
  marketingFlags,
  secondMarketingAbTest,
} from '../flags';
import { DemoFlag } from '@/components/demo-flag';
import { RegenerateIdButton } from '../regenerate-id-button';
import { generatePermutations } from '@vercel/flags/next';
import { SelfDocumentingExampleAlert } from '@/components/self-documenting-example-alert';
import Link from 'next/link';

// Ensure the page is static
export const dynamic = 'error';

// Generate all permutations (all combinations of flag 1 and flag 2).
export async function generateStaticParams() {
  const permutations = await generatePermutations(marketingFlags);
  return permutations.map((code) => ({ code }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const awaitedParams = await params;
  const abTest = await marketingAbTest(awaitedParams.code, marketingFlags);
  const secondAbTest = await secondMarketingAbTest(
    awaitedParams.code,
    marketingFlags,
  );

  return (
    <Content crumbs={['examples', 'marketing-pages']}>
      <h2>Marketing Pages</h2>
      <p>
        This example shows how to use feature flags for marketing pages.
        Dashboard pages are typically static, and served from the CDN at the
        edge.
      </p>
      <p>
        When A/B testing on marketing pages it&apos;s important to avoid layout
        shift and jank, and to keep the pages static. This example shows how to
        keep a page static and serveable from the CDN even when running multiple
        A/B tests on the page.
      </p>
      <h3>Example</h3>
      <p>
        The example below shows the usage of two feature flags on a static page.
        These flags represent two A/B tests which you could be running
        simulatenously.
      </p>
      <div className="flex gap-2">
        <RegenerateIdButton />
      </div>
      <DemoFlag name={marketingAbTest.key} value={abTest} />
      <DemoFlag name={secondMarketingAbTest.key} value={secondAbTest} />
      <SelfDocumentingExampleAlert>
        <Link href="https://github.com/vercel/flags/tree/main/examples/docs/app/examples/marketing-pages">
          Inspect the source code
        </Link>{' '}
        to see the actual usage of the feature flag.
      </SelfDocumentingExampleAlert>
    </Content>
  );
}
