import type { FlagsRequest } from 'flags';

// The evaluation context of all flags of this source, once per request. The
// visitor cookie is demo identity data.
export default function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  const id = request?.cookies?.get('demo-visitor')?.value ?? 'visitor-1';
  return {
    user: { id },
    visitor: { id },
  };
}
