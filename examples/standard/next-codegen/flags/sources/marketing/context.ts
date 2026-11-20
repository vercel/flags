import type { FlagsRequest } from 'flags';

export default function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  return { returning: request?.cookies?.has('visited') ?? false };
}
