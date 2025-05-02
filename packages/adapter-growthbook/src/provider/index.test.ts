import { getProviderData } from '..';
import { setupServer } from 'msw/node';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';

const restHandlers = [
  http.get('https://api.growthbook.io/api/v1/features', () => {
    return HttpResponse.json({
      features: [
        {
          id: 'showdemo',
          defaultValue: 'true',
          environments: {
            production: {
              enabled: true,
              defaultValue: 'true',
              rules: [
                {
                  id: 'fr_abc',
                  type: 'force',
                  enabled: true,
                  value: 'false',
                  condition: '{"id": "1"}',
                  coverage: 1,
                  scheduleRules: [],
                  savedGroupTargeting: [],
                  prerequisites: [],
                },
              ],
            },
          },
          description: 'Show demo banner',
          valueType: 'boolean',
          dateCreated: '2023-01-01T00:00:00.000Z',
          dateUpdated: '2023-01-02T00:00:00.000Z',
          origin: 'https://app.growthbook.io/features/showdemo',
        },
      ],
      limit: 10,
      offset: 0,
      count: 1,
      total: 1,
      hasMore: false,
      nextOffset: 0,
    });
  }),
];

const responseFixture = {
  hints: [],
  definitions: {
    showdemo: {
      description: 'Show demo banner',
      origin: 'https://app.growthbook.io/features/showdemo',
      createdAt: 1672531200000,
      updatedAt: 1672617600000,
      options: [
        { label: 'On', value: true },
        { label: 'Off', value: false },
      ],
    },
  },
};

const server = setupServer(...restHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('getProviderData', () => {
  describe('when called with valid params', () => {
    it('should fetch and return', async () => {
      await expect(
        getProviderData({
          apiKey: 'secret_user_a1b2c3d4e5',
        }),
      ).resolves.toEqual(responseFixture);
    });
  });

  describe('when called with invalid params', () => {
    it('should return hints if missing API key', async () => {
      await expect(
        getProviderData({
          apiKey: '',
        }),
      ).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'growthbook/missing-api-key',
            text: 'Missing GrowthBook API Key',
          },
        ],
      });
    });
  });
});
