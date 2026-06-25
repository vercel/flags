// The `[.]` escapes the leading dot so the directory resolves to
// `/.well-known/vercel/flags` (folders starting with a real dot are ignored by
// the bundler).
import { createFileRoute } from '@tanstack/react-router';
import {
  createFlagsDiscoveryEndpoint,
  getProviderData,
} from 'flags/tanstack-start';
import * as flags from '../../../flags';

const handler = createFlagsDiscoveryEndpoint(() => getProviderData(flags));

export const Route = createFileRoute('/.well-known/vercel/flags')({
  server: { handlers: { GET: handler } },
});
