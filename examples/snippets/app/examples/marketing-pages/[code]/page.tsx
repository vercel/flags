import {
  marketingAbTest,
  marketingFlags,
  secondMarketingAbTest,
} from '../flags';
import { DemoFlag } from '@/components/demo-flag';
import { RegenerateIdButton } from '../regenerate-id-button';
import { generatePermutations } from '@vercel/flags/next';

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
    <>
      <DemoFlag name={marketingAbTest.key} value={abTest} />
      <DemoFlag name={secondMarketingAbTest.key} value={secondAbTest} />
      <div className="flex gap-2">
        <RegenerateIdButton />
      </div>
    </>
  );
}
