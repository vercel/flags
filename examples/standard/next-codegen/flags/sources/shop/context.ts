import type { FlagsRequest } from 'flags';

// Creates the evaluation context from the request, once per request
export default function getEvaluationContext(
  _input: unknown,
  request: FlagsRequest | undefined,
) {
  return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
}
