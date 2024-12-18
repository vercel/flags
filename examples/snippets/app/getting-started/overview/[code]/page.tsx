import { DemoFlag } from '@/components/demo-flag';
import { randomFlag, overviewFlags } from './flags';
import { ReloadButton } from './reload-button';

export const dynamic = 'error';

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const awaitedParams = await params;
  const overview = await randomFlag(awaitedParams.code, overviewFlags);
  return (
    <>
      <DemoFlag name={randomFlag.key} value={overview} />
      <ReloadButton />
    </>
  );
}
