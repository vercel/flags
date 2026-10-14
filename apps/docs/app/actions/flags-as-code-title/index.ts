'use server';

import { flagsAsCodeTitleFlag } from '@/experiment-flags';

export const getFlagsAsCodeTitle = async (): Promise<string> =>
  flagsAsCodeTitleFlag();
