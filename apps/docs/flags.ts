import { createVercelAdapter } from '@flags-sdk/vercel';
import { trackExposure } from '@vercel/analytics/server';
import {
  createClient,
  type experimental_Exposure as Exposure,
} from '@vercel/flags-core';
import { flag } from 'flags/next';

export const flagsClient = createClient({
  experimental_reportExposures: reportExposures,
});

export const vercelAdapter = createVercelAdapter(flagsClient);

function getUnitValue(
  entity: unknown,
  base: Exposure['base'],
): string | undefined {
  const value = base.reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return undefined;
    }

    return (current as Record<PropertyKey, unknown>)[key];
  }, entity);

  return typeof value === 'string' ? value : undefined;
}

/**
 * Reports Vercel Experiments exposures to Web Analytics.
 *
 * Pass it as `experimental_reportExposures` to `createClient` from
 * `@vercel/flags-core`. The exposure unit is resolved from the `identify()`
 * entity using the experiment's base path, so conversion events only need to
 * carry the same unit (for example `visitorId`) to be joined to exposures.
 */
async function reportExposures(
  exposures: readonly Exposure[],
  entity: any,
): Promise<void> {
  await Promise.all(
    exposures.map((exposure) => {
      const unitValue = getUnitValue(entity, exposure.base);

      if (unitValue === undefined) {
        return Promise.resolve();
      }

      return trackExposure({
        experimentId: exposure.experimentId,
        variantId: exposure.variantId ?? 'override',
        unitKey: 'event_data.visitorId',
        unitValue: entity.visitor.id,
        assignmentReason: exposure.assignmentReason,
        rampId: exposure.rampId,
        rampPercentage: exposure.rampPercentage,
      });
    }),
  );
}

export const andyCheckoutFlag = flag({
  adapter: vercelAdapter,
  key: 'andy-checkout-flag',
  options: [false, true],
  defaultValue: false,
  identify({ cookies }) {
    return {
      visitor: {
        id: cookies.get('visitorId')?.value ?? '',
      },
    };
  },
});

// ================================

export const enableBannerFlag = flag({
  key: 'enable-banner-flag',
  description: 'Full-width callout at the top',
  options: [false, true],
  decide({ cookies }) {
    const on = cookies.get(this.key)?.value;
    return on !== '0'; // default on
  },
});

export const enableDitheredHeroFlag = flag({
  key: 'enable-dithered-hero-flag',
  description: 'Keep it dithered',
  options: [false, true],
  decide({ cookies }) {
    const on = cookies.get(this.key)?.value;
    return on === '1'; // default off
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
  andyCheckoutFlag,
] as const;
