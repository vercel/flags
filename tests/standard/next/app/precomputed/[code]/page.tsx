import {
  generatePermutations,
  getPrecomputed,
} from '@flags-sdk/next/precompute';
import { newCheckout, summerSale } from '../../../flags';
import { precomputeFlags } from '../../../precompute';

// Only the pages of generateStaticParams exist. Thus, a response shows that
// the page was built at build time.
export const dynamicParams = false;

export async function generateStaticParams() {
  const codes = await generatePermutations(precomputeFlags);
  return codes.map((code) => ({ code }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [sale, checkout] = await getPrecomputed(
    [summerSale, newCheckout],
    precomputeFlags,
    code,
  );
  return (
    <main>
      <pre id="precomputed">{JSON.stringify({ sale, checkout })}</pre>
    </main>
  );
}
