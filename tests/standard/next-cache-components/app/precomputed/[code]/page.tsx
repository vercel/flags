import {
  generatePermutations,
  getPrecomputed,
} from '@flags-sdk/next/precompute';
import { summerSale } from '../../../flags';

// A precomputed page with Cache Components. getPrecomputed checks the code
// with WebCrypto, which withFlags puts into 'use cache', so that each code
// is prerendered.
const group = [summerSale] as const;

export async function generateStaticParams() {
  const codes = await generatePermutations(group);
  return codes.map((code) => ({ code }));
}

export default async function PrecomputedPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const sale = await getPrecomputed(summerSale, group, code);
  return <p id="sale">{String(sale)}</p>;
}
