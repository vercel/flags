import {
  enableBannerFlag,
  enableDitheredHeroFlag,
  enableHeroTextFlag,
  installAudienceFlag,
} from './site-flags';

// The flags which the proxy precomputes for the homepage. A separate module,
// because a 'use flags' module exports only flags.
export const rootFlags = [
  enableBannerFlag,
  enableHeroTextFlag,
  enableDitheredHeroFlag,
  installAudienceFlag,
] as const;
