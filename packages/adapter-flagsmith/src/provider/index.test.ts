import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getProviderData } from '..';

const mockEnvironmentId = 'test-env-id';

describe('getProviderData', () => {
  const restHandlers = [
    http.get('https://api.flagsmith.com/api/v1/flags/', () => {
      return HttpResponse.json([
        {
          id: 1,
          feature: {
            id: 1,
            name: 'test-flag',
            created_date: '2023-01-01T00:00:00.000Z',
            description: 'Show demo banner',
            initial_value: 'false',
            default_enabled: false,
            type: 'STANDARD',
          },
          feature_state_value: 'true',
          environment: 1,
          identity: null,
          feature_segment: null,
          enabled: true,
        },
        {
          id: 2,
          feature: {
            id: 2,
            name: 'multivariate_test',
            created_date: '2023-01-02T00:00:00.000Z',
            description: 'Multivariate test flag',
            initial_value: 'control',
            default_enabled: true,
            type: 'MULTIVARIATE',
          },
          feature_state_value: 'variant_a',
          environment: 1,
          identity: null,
          feature_segment: null,
          enabled: true,
        },
      ]);
    }),
    http.get(
      'https://api.flagsmith.com/api/v1/flags/2/multivariate-options/',
      () => {
        return HttpResponse.json({
          control_value: 'control',
          options: [{ value: 'variant_a' }, { value: 'variant_b' }],
        });
      },
    ),
  ];

  const server = setupServer(...restHandlers);
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should fetch and return provider data with valid params', async () => {
    const providerData = await getProviderData({
      environmentKey: mockEnvironmentId,
      projectId: 'test-project',
    });
    expect(providerData).toBeDefined();
    expect(providerData.definitions).toBeDefined();
    expect(providerData).toEqual({
      hints: [],
      definitions: {
        'test-flag': {
          description: 'Show demo banner',
          origin: `https://app.flagsmith.com/project/test-project/environment/${mockEnvironmentId}/features/?feature=1`,
          createdAt: 1672531200000,
          options: [
            { label: 'Off', value: false },
            { label: 'On', value: true },
          ],
        },
        multivariate_test: {
          description: 'Multivariate test flag',
          origin: `https://app.flagsmith.com/project/test-project/environment/${mockEnvironmentId}/features/?feature=2`,
          createdAt: 1672617600000,
          options: [
            { label: 'control', value: 'control' },
            { label: 'variant_a', value: 'variant_a' },
            { label: 'variant_b', value: 'variant_b' },
          ],
        },
      },
    });
  });
});
