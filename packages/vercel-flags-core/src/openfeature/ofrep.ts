import type { FlagsClient } from '../client';
import { mapReason } from './utils';

export function createOfrepHandler(flagsClient: FlagsClient) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);

    if (url.pathname !== '/ofrep/v1/evaluate/flags') {
      // TODO implement single evaluateFlag endpoint
      // https://openfeature.dev/docs/reference/other-technologies/ofrep/openapi#tag/OFREP-Core/operation/evaluateFlag
      return Response.json({ error: 'Invalid endpoint' }, { status: 404 });
    }

    const { context } = await req.json();

    // const ifNoneMatch = req.headers.get('If-None-Match');

    // TODO parse ETag and skip content if unchanged
    // TODO create ETag from content + flag config
    //
    // TODO edge config client must be able to return { digest, updatedAt } along with the data
    // TODO data source must forward the digest along with the data
    // TODO evaluateAll must return { results, digest }
    const { flags } = await flagsClient.evaluateAll(context);

    return Response.json(
      {
        flags: Object.entries(flags).map(([key, result]) => ({
          key,
          reason: mapReason(result.reason),
          // variant: reason.variant, // Vercel Flags does not have variant ids
          value: result.value,
          metadata: {},
        })),
        metadata: {},
      },
      // { headers: { ETag: `"a"` } }, // TODO calculate based on Edge Config
    );
  };
}
