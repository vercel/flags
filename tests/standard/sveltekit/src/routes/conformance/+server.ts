import {
  conformanceResult,
  setConformanceSignal,
} from '@flags-sdk/conformance';
import { json, redirect } from '@sveltejs/kit';

// The route of the conformance suite. redirect() of SvelteKit is its signal.
setConformanceSignal(() => redirect(307, '/'));

export async function GET() {
  return json(await conformanceResult());
}
