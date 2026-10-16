import { handleEvaluation } from '../../../../../../lib/handler';
import { options } from '../../../../../../lib/http';

export const runtime = 'nodejs';
export const OPTIONS = options;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return handleEvaluation(request, key);
}
