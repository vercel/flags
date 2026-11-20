import type { FlagsRequest } from 'flags';

export default function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
}
