import { createClient, type FlagsClient, Reason } from '@vercel/flags-core';
import type { Provider } from 'flags';

// The datafile API does not expose a project context schema yet.
export type VercelContext = Record<string, unknown>;

let client: FlagsClient<VercelContext> | undefined;

const provider: Provider<VercelContext> = {
  async evaluate(key, context) {
    // Passing no SDK key selects OIDC. The old FLAGS variable is not used.
    client ??= createClient<VercelContext>({
      clientName: 'flags-protocol-playground',
    });
    const datafile = await client.getDatafile();
    const result = await client.evaluate<unknown>(key, undefined, context);
    if (result.reason === Reason.ERROR) {
      throw new Error(
        `Cannot evaluate ${JSON.stringify(key)}: ${result.errorMessage}`,
      );
    }
    return {
      value: result.value,
      catalogId: `${datafile.projectId}/${datafile.environment}`,
    };
  },
};

export default provider;
