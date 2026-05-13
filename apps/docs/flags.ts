import { flag } from 'flags/next';

export const enableBannerFlag = flag({
  key: 'enable-banner-flag',
  description: 'Full-width callout at the top',
  options: [false, true],
  decide({ cookies }) {
    const on = cookies.get(this.key)?.value;
    return on !== undefined;
  },
});

export const enableDitheredHeroFlag = flag({
  key: 'enable-dithered-hero-flag',
  description: 'Keep it dithered',
  options: [false, true],
  decide({ cookies }) {
    const on = cookies.get(this.key)?.value;
    return on !== undefined;
  },
});

export const enableHeroTextFlag = flag<string>({
  key: 'swap-hero-text',
  description: 'Toggle between headline options for A/B testing',
  options: [
    'The feature flags toolkit',
    'Ship faster with feature flags',
    'Flag features, ship apps faster',
  ],
  decide({ cookies }) {
    const cookieValue = cookies.get(this.key)?.value;
    return cookieValue && this.options?.includes(cookieValue)
      ? cookieValue
      : (this.options![0] as string);
  },
});

export const installAudienceFlag = flag<'humans' | 'agents'>({
  key: 'install-audience',
  description: 'Default tab of the hero install-command switcher',
  options: ['humans', 'agents'],
  decide({ cookies }) {
    const cookieValue = cookies.get(this.key)?.value;
    return cookieValue === 'humans' || cookieValue === 'agents'
      ? cookieValue
      : 'agents';
  },
});

export const rootFlags = [
  enableBannerFlag,
  enableHeroTextFlag,
  enableDitheredHeroFlag,
  installAudienceFlag,
] as const;
