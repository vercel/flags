import { expect, it, describe, vi } from 'vitest';
import { getProviderData } from '..';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http } from 'msw';

const restHandlers = [
  http.get(
    `https://app.launchdarkly.com/api/v2/flags/some-project-key`,
    ({ request }) => {
      const url = new URL(request.url);
      const offset = url.searchParams.get('offset');

      if (offset === '0') {
        return HttpResponse.json({
          items: [
            {
              key: 'some-test-flag',
              description: 'some-test-description',
              creationDate: 1611988083772,
              variations: [
                { value: false, name: 'Off' },
                { value: true, name: 'On' },
              ],
              defaults: { offVariation: 0 },
            },
          ],
          totalCount: 150,
        });
      }

      if (offset === '100') {
        return HttpResponse.json({
          items: [
            {
              key: 'some-test-flag-from-page-2',
              description: 'some-test-description-from-page-2',
              creationDate: 1611988083772,
              variations: [
                { value: false, name: 'Off' },
                { value: true, name: 'On' },
              ],
              defaults: { offVariation: 0 },
            },
          ],
          totalCount: 150,
        });
      }
    },
  ),
];

const server = setupServer(...restHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('getProviderData', () => {
  describe('when called with valid params', () => {
    it('should fetch and return', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      await expect(
        getProviderData({
          apiKey: 'some-api-key',
          environment: 'some-environment',
          projectKey: 'some-project-key',
        }),
      ).resolves.toEqual({
        hints: [],
        definitions: {
          'some-test-flag': {
            description: 'some-test-description',
            options: [
              { label: 'Off', value: false },
              { label: 'On', value: true },
            ],
            origin:
              'https://app.launchdarkly.com/some-project-key/some-environment/features/some-test-flag/targeting',
            createdAt: 1611988083772,
          },
          'some-test-flag-from-page-2': {
            description: 'some-test-description-from-page-2',
            options: [
              { label: 'Off', value: false },
              { label: 'On', value: true },
            ],
            origin:
              'https://app.launchdarkly.com/some-project-key/some-environment/features/some-test-flag-from-page-2/targeting',
            createdAt: 1611988083772,
          },
        },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        'https://app.launchdarkly.com/api/v2/flags/some-project-key?offset=0&limit=100&sort=creationDate',
        expect.any(Object),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        'https://app.launchdarkly.com/api/v2/flags/some-project-key?offset=100&limit=100&sort=creationDate',
        expect.any(Object),
      );
      fetchSpy.mockRestore();
    });
  });

  describe('when called with invalid params', () => {
    it('should return appropriate hints', async () => {
      // @ts-expect-error this is the case we are testing
      await expect(getProviderData({})).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'launchdarkly/missing-api-key',
            text: 'Missing LaunchDarkly API Key',
          },
          {
            key: 'launchdarkly/missing-environment',
            text: 'Missing LaunchDarkly API Key',
          },
          {
            key: 'launchdarkly/missing-environment',
            text: 'Missing LaunchDarkly Project Key',
          },
        ],
      });

      await expect(
        // @ts-expect-error this is the case we are testing
        getProviderData({ apiKey: 'some-api-key' }),
      ).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'launchdarkly/missing-environment',
            text: 'Missing LaunchDarkly API Key',
          },
          {
            key: 'launchdarkly/missing-environment',
            text: 'Missing LaunchDarkly Project Key',
          },
        ],
      });

      await expect(
        // @ts-expect-error this is the case we are testing
        getProviderData({
          apiKey: 'some-api-key',
          environment: 'production',
        }),
      ).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'launchdarkly/missing-environment',
            text: 'Missing LaunchDarkly Project Key',
          },
        ],
      });
    });
  });

  describe('when launchdarkly returns invalid json', () => {
    it('should fetch and return', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        status: 200,
        json: (): Promise<any> => {
          throw new Error('Invalid JSON');
        },
      } as Response);
      await expect(
        getProviderData({
          apiKey: 'some-api-key',
          environment: 'some-environment',
          projectKey: 'some-project-key',
        }),
      ).resolves.toEqual({
        hints: [
          {
            key: 'launchdarkly/response-not-ok/some-project-key',
            text: 'Failed to fetch LaunchDarkly',
          },
        ],
        definitions: {},
      });

      fetchSpy.mockRestore();
    });
  });

  describe('when launchdarkly returns non-200 status code', () => {
    it('should return appropriate hints', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        status: 500,
      } as Response);

      await expect(
        getProviderData({
          apiKey: 'some-api-key',
          environment: 'some-environment',
          projectKey: 'some-project-key',
        }),
      ).resolves.toEqual({
        hints: [
          {
            key: 'launchdarkly/response-not-ok/some-project-key',
            text: 'Failed to fetch LaunchDarkly (Received 500 response)',
          },
        ],
        definitions: {},
      });

      fetchSpy.mockRestore();
    });
  });
});
