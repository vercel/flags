import { createVercelAdapter } from '@flags-sdk/vercel';
import { trackExposure } from '@vercel/analytics/server';
import { createClient } from '@vercel/flags-core';
import { flag } from 'flags/next';
import { headers } from 'next/headers';

export const VISITOR_ID_COOKIE = 'flags-visitor-id';

type Entities = { visitor?: { id: string } };

const flagsClient = createClient<Entities>(process.env.FLAGS, {
  // Joins exposures to `track()` events through `event_data.visitorId`.
  experimental_reportExposures: async (exposures, entities) => {
    const visitorId = entities.visitor?.id;
    if (!visitorId) {
      return;
    }
    const requestHeaders = await headers();
    await Promise.all(
      exposures.map((exposure) => {
        if (!exposure.variantId) {
          return undefined;
        }
        return trackExposure(
          {
            experimentId: exposure.experimentId,
            variantId: exposure.variantId,
            unitKey: 'event_data.visitorId',
            unitValue: visitorId,
            assignmentReason: exposure.assignmentReason,
            rampId: exposure.rampId,
            rampPercentage: exposure.rampPercentage,
          },
          { headers: requestHeaders },
        );
      }),
    );
  },
});

const vercelAdapter = createVercelAdapter(flagsClient);

export const flagsAsCodeTitleFlag = flag<string, Entities>({
  key: 'flags-as-code-title',
  description: 'H1 of the Flags as Code docs page (experiment)',
  options: ['Flags as Code', 'Flags as a Gift'],
  defaultValue: 'Flags as Code',
  adapter: vercelAdapter(),
  identify({ cookies }) {
    const id = cookies.get(VISITOR_ID_COOKIE)?.value;
    return id ? { visitor: { id } } : {};
  },
});
