import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppHost, getProviderData } from '.';

describe('getAppHost', () => {
  it('maps us.i.posthog.com', () => {
    expect(getAppHost('https://us.i.posthog.com')).toBe(
      'https://us.posthog.com',
    );
  });
  it('maps eu.i.posthog.com', () => {
    expect(getAppHost('https://eu.i.posthog.com')).toBe(
      'https://eu.posthog.com',
    );
  });
});

describe('getProviderData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const flag = {
    id: 123,
    key: 'banner',
    name: 'Display the banner',
    filters: { payloads: {} },
  };

  function mockResponses(...bodies: unknown[]) {
    const fetchMock = vi.fn();
    for (const body of bodies) {
      fetchMock.mockResolvedValueOnce(Response.json(body));
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('preserves personal key authentication, pagination, and creation dates', async () => {
    const fetchMock = mockResponses(
      {
        count: 101,
        results: [{ ...flag, created_at: '2026-01-01T00:00:00Z' }],
      },
      { count: 101, results: [{ ...flag, key: 'second' }] },
    );
    const result = await getProviderData({
      personalApiKey: 'personal-test-key',
      projectId: '42',
      appHost: 'https://eu.posthog.com',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://eu.posthog.com/api/projects/42/feature_flags',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer personal-test-key' },
        cache: 'no-store',
      },
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://eu.posthog.com/api/projects/42/feature_flags?offset=100&limit=100',
    );
    expect(result.definitions.banner).toEqual({
      origin: 'https://eu.posthog.com/project/42/feature_flags/123',
      description: 'Display the banner',
      createdAt: Date.parse('2026-01-01T00:00:00Z'),
      options: [{ value: false }, { value: true }],
    });
    expect(result.definitions.second).toBeDefined();
    expect(result.hints).toEqual([]);
  });

  it.each([
    'us',
    'eu',
  ])('loads definitions from the %s ingestion host', async (region) => {
    vi.stubEnv('POSTHOG_HOST', `https://${region}.i.posthog.com`);
    const fetchMock = mockResponses({ flags: [flag] });
    const result = await getProviderData({
      projectSecretApiKey: 'secret-test-key',
      projectId: '42',
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `https://${region}.i.posthog.com/flags/definitions/`,
      {
        method: 'GET',
        headers: { Authorization: 'Bearer secret-test-key' },
        cache: 'no-store',
      },
    );
    expect(result.definitions.banner).toEqual({
      origin: `https://${region}.posthog.com/project/42/feature_flags/123`,
      description: 'Display the banner',
      options: [{ value: false }, { value: true }],
    });
    expect(result.definitions.banner).not.toHaveProperty('createdAt');
  });

  it('supports separate custom API and dashboard hosts', async () => {
    const fetchMock = mockResponses({ flags: [flag] });
    const result = await getProviderData({
      projectSecretApiKey: 'secret-test-key',
      projectId: '42',
      apiHost: 'https://ingestion.example.com/',
      appHost: 'https://posthog.example.com',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://ingestion.example.com/flags/definitions/',
    );
    expect(result.definitions.banner?.origin).toBe(
      'https://posthog.example.com/project/42/feature_flags/123',
    );
  });

  it.each([
    'personal',
    'project',
  ] as const)('maps payloads and variants in %s mode', async (mode) => {
    const items = [
      { ...flag, key: 'payload', filters: { payloads: { true: '"green"' } } },
      {
        ...flag,
        key: 'experiment',
        filters: {
          payloads: {},
          multivariate: {
            variants: [{ key: 'control' }, { key: 'test', name: 'Test group' }],
          },
        },
      },
      { ...flag, key: 'boolean', filters: {} },
    ];
    mockResponses(
      mode === 'personal'
        ? { count: items.length, results: items }
        : { flags: items },
    );
    const credentials =
      mode === 'personal'
        ? { personalApiKey: 'personal-test-key' }
        : { projectSecretApiKey: 'secret-test-key' };
    const result = await getProviderData({
      ...credentials,
      projectId: '42',
      appHost: 'https://us.posthog.com',
    });
    expect(result.definitions.payload?.options).toEqual([
      { label: 'true', value: 'green' },
    ]);
    expect(result.definitions.experiment?.options).toEqual([
      { value: false },
      { value: 'control', label: 'control' },
      { value: 'test', label: 'Test group' },
    ]);
    expect(result.definitions.boolean?.options).toEqual([
      { value: false },
      { value: true },
    ]);
  });

  it.each([
    'personal',
    'project',
  ] as const)('reports unauthorized responses in %s mode', async (mode) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const credentials =
      mode === 'personal'
        ? { personalApiKey: 'personal-test-key' }
        : { projectSecretApiKey: 'secret-test-key' };
    const result = await getProviderData({
      ...credentials,
      projectId: '42',
      appHost: 'https://us.posthog.com',
    });
    expect(result).toEqual({
      definitions: {},
      hints: [
        {
          key: 'posthog/response-not-ok/42',
          text: 'Failed to fetch PostHog (Received 401 response)',
        },
      ],
    });
  });

  it('reports the missing credential for the selected mode without fetching', async () => {
    const fetchMock = mockResponses();
    for (const [credentials, key] of [
      [{ personalApiKey: '' }, 'posthog/missing-personal-api-key'],
      [{ projectSecretApiKey: '' }, 'posthog/missing-project-secret-api-key'],
    ] as const) {
      const result = await getProviderData({
        ...credentials,
        projectId: '42',
        appHost: 'https://us.posthog.com',
      });
      expect(result.hints?.[0]?.key).toBe(key);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
