import { flag } from '@vercel/flags/next';
import { DemoFlag } from '@/components/demo-flag';
import { ReloadButton } from './reload-button';

// declare a feature flag
const randomFlag = flag<boolean>({
  key: 'random-flag',
  decide() {
    // this flag will be on for 50% of visitors
    return Math.random() > 0.5;
  },
});

export default async function Page() {
  // use the feature flag
  const overview = await randomFlag();

  return (
    <>
      <DemoFlag name={randomFlag.key} value={overview} />
      <ReloadButton />
    </>
  );
}
