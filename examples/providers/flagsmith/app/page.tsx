import { FlagValues } from '@flags-sdk/next/flag-values';
import { evaluate } from 'flags';
import { showBanner, welcomeMessage } from '../flags';

export default async function Home() {
  const [message, banner] = await evaluate([welcomeMessage, showBanner]);

  return (
    <main>
      <FlagValues
        values={{ [welcomeMessage.key]: message, [showBanner.key]: banner }}
      />
      <p>Flags SDK + Flagsmith</p>
      <h1>{message}</h1>
      {banner && <aside>The feature flag enabled this banner.</aside>}
      <p>
        Change <code>welcome_message</code> or <code>show_banner</code> in
        Flagsmith, then refresh this page.
      </p>
      <a href="https://github.com/open-feature/js-sdk-contrib/tree/main/libs/providers/flagsmith">
        Provider documentation
      </a>
    </main>
  );
}
