import { basicIdentifyExampleFlag } from './flags';
import { DemoFlag } from '@/components/demo-flag';

export default async function Page() {
  const basic = await basicIdentifyExampleFlag();

  return <DemoFlag name={basicIdentifyExampleFlag.key} value={basic} />;
}
