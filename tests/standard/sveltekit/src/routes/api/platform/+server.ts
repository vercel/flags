import { json } from '@sveltejs/kit';
import { newCheckout } from '../../../lib/default-flags';

export async function GET() {
  return json({ checkout: await newCheckout() });
}
