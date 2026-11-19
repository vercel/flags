import type { RequestInputs } from 'flags';

export default async function getEvaluationContext({ cookies }: RequestInputs) {
  const id = cookies.get('demo-visitor')?.value ?? 'visitor-1';
  return {
    user: { id },
    visitor: { id },
  };
}
