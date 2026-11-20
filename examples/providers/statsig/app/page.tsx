import { FlagValues } from '@flags-sdk/next/flag-values';
import { evaluate } from 'flags';
import { showBanner, welcomeMessage } from '../flags';

export default async function Home() {
  const [message, banner] = await evaluate([welcomeMessage, showBanner]);

  return (
    <main>
      <FlagValues flags={[welcomeMessage, showBanner]} />
      <p>Flags SDK + Statsig</p>
      <h1>{message}</h1>
      {banner && <aside>The feature flag enabled this banner.</aside>}
      <p>
        Change the dynamic config <code>welcome_message_text</code> or the
        feature gate <code>show_banner</code> in Statsig, then refresh this
        page.
      </p>
      <a href="https://flags-sdk.dev/docs/providers/openfeature#statsig">
        Provider documentation
      </a>
    </main>
  );
}
