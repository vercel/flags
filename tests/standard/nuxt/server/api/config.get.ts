import { evaluate } from 'flags';
import { greeting, newCheckout } from '../../lib/default-flags';

// No runtime.onInvoke: the binding gets the request from useEvent()
export default defineEventHandler(async () => {
  const [checkout, text] = await evaluate([newCheckout, greeting]);
  return { checkout, text };
});
