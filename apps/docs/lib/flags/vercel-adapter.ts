import { createVercelAdapter } from '@flags-sdk/vercel';
import { createClient } from '@vercel/flags-core';
import type { Entities } from './identify';
import { reportExposures } from './report-exposures';

export const flagsClient = createClient<Entities>({
  experimental_reportExposures: reportExposures,
});

export const vercelAdapter = createVercelAdapter(flagsClient);
