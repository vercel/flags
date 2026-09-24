import { vercelAdapter } from '@flags-sdk/vercel';
import { flag } from 'flags/next';

export const welcomeMessage = flag<string>({
  key: 'welcome_message',
  defaultValue: 'Welcome to the Vercel example',
  adapter: vercelAdapter(),
});

export const showBanner = flag<boolean>({
  key: 'show_banner',
  defaultValue: false,
  adapter: vercelAdapter(),
});
