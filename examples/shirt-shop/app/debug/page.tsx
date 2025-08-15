import { testFlags } from '@/flags';
import { precompute } from 'flags/next';

export default async function Page() {
  const before = performance.now();
  await precompute(testFlags);
  const after = performance.now();

  const before1 = performance.now();
  await precompute(testFlags);
  const after1 = performance.now();

  console.log('precompute', after - before, after1 - before1);

  return (
    <ul>
      <li>{after - before}ms</li>
      <li>{after1 - before1}ms</li>
    </ul>
  );
}
