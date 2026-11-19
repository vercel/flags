'use flags';

import { defineFlag, type FlagsRequest } from 'flags';

// The flags of the homepage. They are inline flags: the code decides their
// value from a cookie, so Flags Explorer and the toggles on the page can set
// them. A 'use flags' module exports only flags, so withFlags registers them
// and the flags manifest lists them for Flags Explorer.

function cookie(request: FlagsRequest | undefined, key: string) {
  return request?.cookies?.get(key)?.value;
}

const heroTexts = [
  'Feature flags for every framework',
  'One standard for feature flags',
  'The feature flags toolkit',
] as const;

export const enableBannerFlag = defineFlag({
  key: 'enable-banner-flag',
  description: 'Full-width callout at the top',
  options: [false, true],
  // On by default
  decide: (_context, request) => cookie(request, 'enable-banner-flag') !== '0',
});

export const enableDitheredHeroFlag = defineFlag({
  key: 'enable-dithered-hero-flag',
  description: 'Keep it dithered',
  options: [false, true],
  // Off by default
  decide: (_context, request) =>
    cookie(request, 'enable-dithered-hero-flag') === '1',
});

export const enableHeroTextFlag = defineFlag({
  key: 'swap-hero-text',
  type: 'string',
  description: 'Toggle between headline options for A/B testing',
  options: heroTexts,
  decide: (_context, request) => {
    const value = cookie(request, 'swap-hero-text');
    const known = heroTexts.find((text) => text === value);
    if (known) {
      return known;
    }
    return heroTexts[0];
  },
});

export const installAudienceFlag = defineFlag({
  key: 'install-audience',
  type: 'string',
  description: 'Default tab of the hero install-command switcher',
  options: ['humans', 'agents'],
  decide: (_context, request) => {
    const value = cookie(request, 'install-audience');
    if (value === 'humans') {
      return 'humans';
    }
    return 'agents';
  },
});
