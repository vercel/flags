import {
  conformanceResult,
  setConformanceSignal,
} from '@flags-sdk/conformance';
import { redirect } from 'next/navigation';

// The route of the conformance suite. redirect() of Next.js is its signal.
setConformanceSignal(() => redirect('/'));

export async function GET() {
  return Response.json(await conformanceResult());
}
