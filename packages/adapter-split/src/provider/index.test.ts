import { expect, it, describe } from 'vitest';
import { getSplitData } from '.';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http } from 'msw';

const restHandlers = [
  http.get(
    `https://api.split.io/internal/api/v2/splits/ws/*/environments/*`,
    () => {
      const objects: unknown[] = [];

      objects.push({
        id: '48436c00-d542-11ee-bc5f-a6abe0958405',
        name: 'activation_of_new_billing',
        creationTime: 1709583612918,
        treatments: [
          {
            name: 'off',
            description: '',
          },
          {
            name: '2024-02-01',
            description: '',
          },
          {
            name: '2024-03-01',
            description: '',
          },
          {
            name: '2024-04-01',
            description: '',
          },
        ],
      });

      objects.push({
        id: 'f66f1690-d541-11ee-8a6b-2a4bfd0c2d76',
        name: 'show_new_details',
        treatments: [
          {
            name: 'on',
            description: '',
          },
          {
            name: 'off',
            description: '',
          },
        ],
      });

      return HttpResponse.json({
        objects,
        offset: 0,
        limit: 50,
        totalCount: objects.length,
      });
    },
  ),
];

const server = setupServer(...restHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('getSplitData', () => {
  describe('when called with valid params', () => {
    it('should fetch and return', async () => {
      await expect(
        getSplitData({
          adminApiKey: 'this-is-my-api-key',
          organizationId: 'af791880-d541-11ee-8a6b-2a4bfd0c2d76',
          environmentId: 'cda1af20-d541-11fe-8c6b-2a4bfd0c2d76',
          workspaceId: 'cd907110-d541-11ee-8a6b-2a4bfd0c2d55',
        }),
      ).resolves.toEqual({
        hints: [],
        definitions: {
          activation_of_new_billing: {
            options: [
              { value: 'off' },
              { value: '2024-02-01' },
              { value: '2024-03-01' },
              { value: '2024-04-01' },
            ],
            origin:
              'https://app.split.io/org/af791880-d541-11ee-8a6b-2a4bfd0c2d76/ws/cd907110-d541-11ee-8a6b-2a4bfd0c2d55/splits/48436c00-d542-11ee-bc5f-a6abe0958405/env/cda1af20-d541-11fe-8c6b-2a4bfd0c2d76/definition',
            createdAt: 1709583612918,
          },
          show_new_details: {
            options: [{ value: 'on' }, { value: 'off' }],
            origin:
              'https://app.split.io/org/af791880-d541-11ee-8a6b-2a4bfd0c2d76/ws/cd907110-d541-11ee-8a6b-2a4bfd0c2d55/splits/f66f1690-d541-11ee-8a6b-2a4bfd0c2d76/env/cda1af20-d541-11fe-8c6b-2a4bfd0c2d76/definition',
          },
        },
      });
    });
  });

  describe('when called with invalid params', () => {
    it('should return appropriate hints', async () => {
      // @ts-expect-error this is the case we are testing
      await expect(getSplitData({})).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'split/missing-api-key',
            text: 'Missing Split Admin API Key',
          },
          {
            key: 'split/missing-workspace-id',
            text: 'Missing Split Workspace Id',
          },
          {
            key: 'split/missing-organization-id',
            text: 'Missing Split Organization Id',
          },
          {
            key: 'split/missing-environment-id',
            text: 'Missing Split Environment Id',
          },
        ],
      });

      await expect(
        // @ts-expect-error this is the case we are testing
        getSplitData({ adminApiKey: 'some-api-key' }),
      ).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'split/missing-workspace-id',
            text: 'Missing Split Workspace Id',
          },
          {
            key: 'split/missing-organization-id',
            text: 'Missing Split Organization Id',
          },
          {
            key: 'split/missing-environment-id',
            text: 'Missing Split Environment Id',
          },
        ],
      });

      await expect(
        // @ts-expect-error this is the case we are testing
        getSplitData({
          adminApiKey: 'this-is-my-api-key',
          organizationId: 'af791880-d541-11ee-8a6b-2a4bfd0c2d76',
          environmentId: 'cda1af20-d541-11fe-8c6b-2a4bfd0c2d76',
        }),
      ).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'split/missing-workspace-id',
            text: 'Missing Split Workspace Id',
          },
        ],
      });
    });
  });
});
