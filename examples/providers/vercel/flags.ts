import { vercelAdapter } from '@flags-sdk/vercel';
import { flag } from 'flags/next';

export const welcomeMessage = flag<string>({
  key: 'welcome_message',
  description: 'The welcome message shown on the home page.',
  defaultValue: 'Welcome to the Vercel example',
  adapter: vercelAdapter(),
});

export const showBanner = flag<boolean>({
  key: 'show_banner',
  description: 'Show the promotional banner on the home page.',
  defaultValue: false,
  adapter: vercelAdapter(),
});
