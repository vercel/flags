import { generatePermutations, getPrecomputed } from 'flags/next/precompute';
import { newCheckout, precomputeFlags, summerSale } from '../../../flags';

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
