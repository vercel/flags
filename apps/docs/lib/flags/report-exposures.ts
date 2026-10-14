import { trackExposure } from '@vercel/analytics/server';
import type { experimental_Exposure as Exposure } from '@vercel/flags-core';
import type { Entities } from './identify';

/**
 * Reports Vercel Experiments exposures to Web Analytics.
 *
 * Pass it as `experimental_reportExposures` to `createClient` from
 * `@vercel/flags-core`. The exposure unit is resolved from the `identify()`
 * entity using the experiment's base path, so conversion events only need to
 * carry the same unit (for example `visitorId`) to be joined to exposures.
 */
// On Vercel the SDK reads request headers from the Vercel request context.
// `next dev` has no such context, so it needs explicit headers to send at all.
const localOptions =
  process.env.NODE_ENV === 'development' ? { headers: {} } : undefined;

export async function reportExposures(
  exposures: readonly Exposure[],
  entity: Readonly<Entities>,
): Promise<void> {
  await Promise.all(
    exposures.map((exposure) => {
      const unitValue = entity.user?.id ?? '';

      return trackExposure(
        {
          experimentId: exposure.experimentId,
          variantId: exposure.variantId ?? 'override',
          unitKey: 'event_data.userId',
          unitValue,
          assignmentReason: exposure.assignmentReason,
          rampId: exposure.rampId,
          rampPercentage: exposure.rampPercentage,
        },
        localOptions,
      );
    }),
  );
}
