import {
  conformanceResult,
  setConformanceSignal,
} from '@flags-sdk/conformance';
import { createFileRoute, redirect } from '@tanstack/react-router';

// The route of the conformance suite. redirect() of TanStack Router is its
// signal.
setConformanceSignal(() => redirect({ href: '/', statusCode: 307 }));

export const Route = createFileRoute('/conformance')({
  server: {
    handlers: {
      GET: async () => Response.json(await conformanceResult()),
    },
  },
});
