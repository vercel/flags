import { testFlags } from '@/flags';
import { precompute } from 'flags/next';
import { ldAdapter } from '@flags-sdk/launchdarkly';

export default async function Page() {
  const prepareBefore = performance.now();
  await ldAdapter.ldClient.waitForInitialization();
  const prepareAfter = performance.now();
  console.log('prepare', prepareAfter - prepareBefore);

  const before = performance.now();
  const code = await precompute(testFlags);
  const after = performance.now();

  const before1 = performance.now();
  await precompute(testFlags);
  const after1 = performance.now();

  console.log('precompute', after - before, after1 - before1);

  const firstTestFlag = testFlags[0];
  const firstTestFlagValue = await firstTestFlag(code, testFlags);
  console.log('firstTestFlagValue', firstTestFlagValue);

  return (
    <>
      <p>with patched ld (esm and cjs)</p>
      <ul>
        <li>{prepareAfter - prepareBefore}ms</li>
        <li>{after - before}ms</li>
        <li>{after1 - before1}ms</li>
        <li>{JSON.stringify(firstTestFlagValue)}</li>
      </ul>
    </>
  );
}
