import type { FlagsRequest } from 'flags';

// Creates the evaluation context from the request, once per request
export default function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  return {
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
    beta: request?.cookies?.get('beta')?.value === '1',
  };
}
