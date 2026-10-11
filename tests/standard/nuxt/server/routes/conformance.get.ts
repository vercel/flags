import {
  conformanceResult,
  setConformanceSignal,
} from '@flags-sdk/conformance';

// The route of the conformance suite. createError() of Nitro is its signal.
setConformanceSignal(() => createError({ statusCode: 307 }));

export default defineEventHandler(() => conformanceResult());
