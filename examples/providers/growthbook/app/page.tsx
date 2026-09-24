import { evaluate } from 'flags/next';
import { FlagValues } from 'flags/react';
import { showBanner, welcomeMessage } from '../flags';

export default async function Home() {
  const [message, banner] = await evaluate([welcomeMessage, showBanner]);

  return (
    <main>
      <FlagValues
        values={{ [welcomeMessage.key]: message, [showBanner.key]: banner }}
      />
      <p>Flags SDK + GrowthBook</p>
      <h1>{message}</h1>
      {banner && <aside>The feature flag enabled this banner.</aside>}
      <p>
        Change <code>welcome_message</code> or <code>show_banner</code> in
        GrowthBook, then refresh this page.
      </p>
      <a href="https://flags-sdk.dev/providers/growthbook">
        Adapter documentation
      </a>
    </main>
  );
}
