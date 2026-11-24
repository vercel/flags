import type { FlagsRequest } from 'flags';

// The evaluation context of all flags of this source, once per request
export default function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
}
