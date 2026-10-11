import type { Handle } from '@sveltejs/kit';
import { runtime } from 'flags';

// Each request runs in runtime.onInvoke, so the flags get the request
export const handle: Handle = ({ event, resolve }) =>
  runtime.onInvoke(event.request, () => resolve(event));
