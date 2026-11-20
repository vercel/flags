import { FlagValues } from '@flags-sdk/next/flag-values';
import { evaluate } from 'flags';
import { showBanner, welcomeMessage } from '../flags';

export default async function Home() {
  const [message, banner] = await evaluate([welcomeMessage, showBanner]);

  // The payload of welcome_message can be any JSON value
  let heading = JSON.stringify(message);
  if (typeof message === 'string') {
    heading = message;
  }

  return (
    <main>
      <FlagValues
        values={{ [welcomeMessage.key]: message, [showBanner.key]: banner }}
      />
      <p>Flags SDK + PostHog</p>
      <h1>{heading}</h1>
      {banner && <aside>The feature flag enabled this banner.</aside>}
      <p>
        Change <code>welcome_message</code> or <code>show_banner</code> in
        PostHog, then refresh this page.
      </p>
      <a href="https://flags-sdk.dev/docs/providers/openfeature#posthog">
        Provider documentation
      </a>
    </main>
  );
}
