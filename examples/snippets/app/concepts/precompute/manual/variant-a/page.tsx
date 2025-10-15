import { DemoFlag } from '@/components/demo-flag';
import { manualPrecomputeFlag } from '../flags';

export default function Page() {
  return <DemoFlag name={manualPrecomputeFlag.key} value={true} />;
}
