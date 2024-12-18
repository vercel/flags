import { DemoFlag } from '@/components/demo-flag';
import { customAdapterFlag } from './flags';

export default async function Page() {
  const customAdapter = await customAdapterFlag();
  return <DemoFlag name={customAdapterFlag.key} value={customAdapter} />;
}
