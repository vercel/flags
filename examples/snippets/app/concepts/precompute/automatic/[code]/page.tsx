import { DemoFlag } from '@/components/demo-flag';
import {
  firstPrecomputedFlag,
  secondPrecomputedFlag,
  marketingFlags,
} from './flags';

type Params = Promise<{ code: string }>;

export default async function Page({ params }: { params: Params }) {
  const { code } = await params;
  // access the precomputed result by passing params.code and the group of
  // flags used during precomputation of this route segment
  const firstPrecomputed = await firstPrecomputedFlag(code, marketingFlags);
  const secondPrecomputed = await secondPrecomputedFlag(code, marketingFlags);

  return (
    <div>
      <DemoFlag name={firstPrecomputedFlag.key} value={firstPrecomputed} />
      <DemoFlag name={secondPrecomputedFlag.key} value={secondPrecomputed} />
    </div>
  );
}
