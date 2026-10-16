import { handleEvaluation } from '../../../../../lib/handler';
import { options } from '../../../../../lib/http';

export const runtime = 'nodejs';
export const OPTIONS = options;

export function POST(request: Request) {
  return handleEvaluation(request);
}
