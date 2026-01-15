import type { Identify } from 'flags';
import { dedupe } from 'flags/next';
import { getStableId } from './get-stable-id';

export type EvaluationContext = {
  user?: { id: string };
};

export const identify = dedupe(async () => {
  const stableId = await getStableId();

  return { user: { id: stableId.value } };
}) satisfies Identify<EvaluationContext>;
