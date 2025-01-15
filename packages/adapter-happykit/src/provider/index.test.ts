import { expect, it, describe } from 'vitest';
import { getProviderData } from '..';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http } from 'msw';

const project = { slug: 'happykit-example' };

const owner = { slug: 'dferber' };

const flag = {
  slug: 'myBooleanFeatureFlag',
  variants: [
    { name: 'ON', value: true },
    { name: 'OFF', value: false },
  ],
  createdAt: '2021-01-30T06:28:03.772826Z',
  updatedAt: '2021-01-31T08:03:36.526686Z',
};

const restHandlers = [
  http.get(
    `https://happykit.dev/api/project/flags_pub_development_272357356657967622`,
    () => {
      return HttpResponse.json({
        project,
        owner,
        flags: [flag],
      });
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
      await expect(
        getProviderData({
          apiToken: 'this-is-my-api-token',
          envKey: 'flags_pub_development_272357356657967622',
        }),
      ).resolves.toEqual({
        hints: [],
        definitions: {
          myBooleanFeatureFlag: {
            options: [
              { value: true, label: 'ON' },
              { value: false, label: 'OFF' },
            ],
            origin:
              'https://happykit.dev/dferber/happykit-example/flag/development/myBooleanFeatureFlag',
            updatedAt: 1612080216526,
            createdAt: 1611988083772,
          },
        },
      });
    });
  });

  describe('when called with invalid params', () => {
    it('should return appropriate hints', async () => {
      // @ts-expect-error this is the case we are testing
      await expect(getProviderData({})).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'happykit/missing-api-token',
            text: 'Missing HappyKit API Token',
          },
          {
            key: 'happykit/missing-env-key',
            text: 'Missing HappyKit Environment Key',
          },
        ],
      });

      await expect(
        // @ts-expect-error this is the case we are testing
        getProviderData({ apiToken: 'some-api-token' }),
      ).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'happykit/missing-env-key',
            text: 'Missing HappyKit Environment Key',
          },
        ],
      });

      await expect(
        // @ts-expect-error this is the case we are testing
        getProviderData({
          envKey: 'flags_pub_development_272357356657967622',
        }),
      ).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'happykit/missing-api-token',
            text: 'Missing HappyKit API Token',
          },
        ],
      });
    });
  });
});
