import { DemoFlag } from '@/components/demo-flag';
import { randomFlag } from './flags';
import { ReloadButton } from './reload-button';

export default async function Page() {
  const overview = await randomFlag();
  return (
    <>
      <DemoFlag name={randomFlag.key} value={overview} />
      <ReloadButton />
    </>
  );
}
