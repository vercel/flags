import { evaluate } from 'flags';
import { bannerText, newCheckout, summerSale } from '../../../flags';
import { contextCalls } from '../../../flags.config';

export async function GET(request: Request) {
  const [sale, checkout, banner] = await evaluate([
    summerSale,
    newCheckout,
    bannerText,
  ]);
  // Evaluate again in the same request: the context comes from the cache
  await newCheckout();
  await summerSale();

  const requestId = request.headers.get('x-request-id') ?? '';
  return Response.json({
    sale,
    checkout,
    banner,
    contextCalls: contextCalls(requestId),
  });
}
