import { ProviderData } from 'flags';

// See: https://docs.split.io/reference/get-feature-flag
interface ListFeatureFlagsResponseBody {
  objects: {
    id: string;
    name: string;
    trafficType: Record<string, unknown>;
    creationTime: number;
    treatments: {
      name: string;
      description: string;
    }[];
  }[];
  offset: number;
  limit: number;
  totalCount: number;
}

export async function getProviderData(options: {
  adminApiKey: string;
  workspaceId: string;
  organizationId: string;
  environmentId: string;
}): Promise<ProviderData> {
  const hints: Exclude<ProviderData['hints'], undefined> = [];
  const objects: ListFeatureFlagsResponseBody['objects'] = [];

  if (!options.adminApiKey) {
    hints.push({
      key: 'split/missing-api-key',
      text: 'Missing Split Admin API Key',
    });
  }

  if (!options.workspaceId) {
    hints.push({
      key: 'split/missing-workspace-id',
      text: 'Missing Split Workspace Id',
    });
  }

  if (!options.organizationId) {
    hints.push({
      key: 'split/missing-organization-id',
      text: 'Missing Split Organization Id',
    });
  }

  if (!options.environmentId) {
    hints.push({
      key: 'split/missing-environment-id',
      text: 'Missing Split Environment Id',
    });
  }

  // Abort early if called with incomplete options.
  if (hints.length > 0) return { definitions: {}, hints };

  let initialTotalCount = -1;

  while (true) {
    const response = await fetch(
      `https://api.split.io/internal/api/v2/splits/ws/${options.workspaceId}/environments/${options.environmentId}?limit=50&offset=${objects.length}`,
      {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${options.adminApiKey}`,
        },
        // @ts-expect-error used by some Next.js versions
        cache: 'no-store',
      },
    );

    if (response.status !== 200) {
      // Consume the response body to free up connections.
      await response.arrayBuffer();

      return {
        definitions: {},
        hints: [
          {
            key: 'split/response-not-ok',
            text: `Failed to fetch Split (Received ${response.status} response)`,
          },
        ],
      };
    }

    const body = (await response.json()) as ListFeatureFlagsResponseBody;
    objects.push(...body.objects);

    // Only consider the first `totalCount` to prevent issues with flags
    // being created during the fetching process.
    if (initialTotalCount === -1) {
      initialTotalCount = body.totalCount;
    }

    if (objects.length >= initialTotalCount || body.objects.length === 0) {
      break;
    }
  }

  const definitions = objects.reduce<ProviderData['definitions']>(
    (acc, item) => {
      acc[item.name] = {
        // TODO: We'd need to fetch each feature flag separately to get the description, do we want that?
        // description: item.description,
        // Note that the name is the value itself
        options: item.treatments.map(({ name }) => ({ value: name })),
        origin: `https://app.split.io/org/${options.organizationId}/ws/${options.workspaceId}/splits/${item.id}/env/${options.environmentId}/definition`,
        createdAt: item.creationTime,
      };
      return acc;
    },
    {},
  );

  return { definitions, hints };
}
