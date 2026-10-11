import { evaluate } from 'flags';
import { greeting, newCheckout } from '../../lib/default-flags';

// No runtime.onInvoke: the binding gets the request from getRequestEvent()
export async function load() {
  const [checkout, text] = await evaluate([newCheckout, greeting]);
  return { checkout, text };
}
