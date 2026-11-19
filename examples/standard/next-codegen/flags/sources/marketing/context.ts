import type { FlagsRequest } from 'flags';

export default function getEvaluationContext(
  _input: unknown,
  request: FlagsRequest | undefined,
) {
  return { returning: request?.cookies?.has('visited') ?? false };
}
