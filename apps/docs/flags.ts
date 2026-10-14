import { flag } from 'flags/next';
import { trackExposure } from '@vercel/analytics/server';
import { createClient, type experimental_Exposure as Exposure } from '@vercel/flags-core';
import { createVercelAdapter } from '@flags-sdk/vercel';

type Entity = {
  visitor: {
    id: string
  }
}

/**
 * Reports Vercel Experiments exposures to Web Analytics.
 *
 * Pass it as `experimental_reportExposures` to `createClient` from
 * `@vercel/flags-core`. The exposure unit is resolved from the `identify()`
 * entity using the experiment's base path, so conversion events only need to
 * carry the same unit (for example `visitorId`) to be joined to exposures.
 */
export async function reportExposures(
  exposures: readonly Exposure[],
  entity: Readonly<Entity>,
): Promise<void> {
  await Promise.all(
    exposures.map((exposure) => {
      return trackExposure({
        experimentId: exposure.experimentId,
        variantId: exposure.variantId ?? 'override',
        unitKey: "event_data.visitorId",
        unitValue: entity.visitor.id,
        assignmentReason: exposure.assignmentReason,
        rampId: exposure.rampId,
        rampPercentage: exposure.rampPercentage,
      });
    }),
  );
}

 const flagsClient = createClient({
  experimental_reportExposures: reportExposures,
});

const vercelAdapter = createVercelAdapter(flagsClient);

export const experimentFlag = flag<boolean, Entity>({
  key: 'luis-checkout-flag',
  options: [false, true],
  adapter: vercelAdapter,
  identify({cookies}) {
    return {
      visitor: {
        id: cookies.get('visitorId')?.value ?? ''
      }
    }
  }
});

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
  experimentFlag
] as const;
