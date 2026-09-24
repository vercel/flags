import { evaluate } from 'flags/next';
import { showBanner, welcomeMessage } from '../flags';

export default async function Home() {
  // using evaluate() for batch evaluation, could also call invidually
  // const message = await welcomeMessage()
  // const banner = await showBanner()
  const [message, banner] = await evaluate([welcomeMessage, showBanner]);

  return (
    <main>
      <p>Flags SDK + Flagsmith</p>
      <h1>{message}</h1>
      {banner && <aside>The feature flag enabled this banner.</aside>}
      <p>
        Change <code>welcome_message</code> or <code>show_banner</code> in
        Flagsmith, then refresh this page.
      </p>
      <a href="https://flags-sdk.dev/providers/flagsmith">
        Adapter documentation
      </a>
    </main>
  );
}
