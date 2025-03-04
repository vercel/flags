import { Identify } from 'flags';
import { dedupe } from 'flags/next';
import { getStableId } from './get-stable-id';

export type EvaluationContext = {
  stableId?: string;
};

export const identify = dedupe(async () => {
  const stableId = await getStableId();

  return { stableId: stableId.value };
}) satisfies Identify<EvaluationContext>;
