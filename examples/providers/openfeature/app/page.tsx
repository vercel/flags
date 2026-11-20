import { FlagValues } from '@flags-sdk/next/flag-values';
import { evaluate } from 'flags';
import { showBanner, welcomeMessage } from '../flags';

export default async function Home() {
  const [message, banner] = await evaluate([welcomeMessage, showBanner]);

  return (
    <main>
      <FlagValues flags={[welcomeMessage, showBanner]} />
      <p>Flags SDK + OpenFeature</p>
      <h1>{message}</h1>
      {banner && <aside>The feature flag enabled this banner.</aside>}
      <p>
        Change <code>welcome_message</code> or <code>show_banner</code> in{' '}
        <code>flags.ts</code>, then refresh this page.
      </p>
      <a href="https://flags-sdk.dev/providers/openfeature">
        Provider documentation
      </a>
    </main>
  );
}
