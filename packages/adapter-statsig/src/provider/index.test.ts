import { expect, it, describe } from 'vitest';
import { getProviderData } from '..';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http } from 'msw';

const restHandlers = [
  http.get(`https://statsigapi.net/console/v1/gates`, () => {
    return HttpResponse.json({
      data: [
        {
          id: 'show_high_definition_images',
          name: 'Show high definition images',
          description: 'Show high definition product images',
          idType: 'stableID',
          lastModifierID: '40iUyy9YMkgpkWw8lUSJro',
          lastModifiedTime: 1708981874677,
          lastModifierName: 'Andy',
          lastModifierEmail: 'andy@example.com',
          creatorID: '40iUyy9YMkgpkWw8lUSJro',
          createdTime: 1708981092158,
          creatorName: 'Andy',
          creatorEmail: 'andy@example.com',
          targetApps: [],
          holdoutIDs: [],
          tags: [],
          isEnabled: true,
          status: 'In Progress',
          rules: [
            {
              name: 'Percentage',
              passPercentage: 50,
              conditions: [
                {
                  type: 'public',
                },
              ],
              environments: null,
            },
          ],
          checksPerHour: 0,
          type: 'TEMPORARY',
          typeReason: 'NONE',
        },
        {
          id: 'show_new_product_details',
          name: 'Show new product details',
          description: 'Shows the new product details.',
          idType: 'userID',
          lastModifierID: '40iUyy9YMkgpkWw8lUSJro',
          lastModifiedTime: 1708975899169,
          lastModifierName: 'Andy',
          lastModifierEmail: 'andy@example.com',
          creatorID: '40iUyy9YMkgpkWw8lUSJro',
          createdTime: 1708975725889,
          creatorName: 'Andy',
          creatorEmail: 'andy@example.com',
          targetApps: [],
          holdoutIDs: [],
          tags: [],
          isEnabled: true,
          status: 'In Progress',
          rules: [
            {
              name: 'Vercelians',
              passPercentage: 100,
              conditions: [
                {
                  type: 'user_id',
                  targetValue: ['andy', 'dominik'],
                  operator: 'any',
                },
              ],
              environments: null,
            },
            {
              name: 'Testers',
              passPercentage: 50,
              conditions: [
                {
                  type: 'user_id',
                  targetValue: ['tobi', 'timo'],
                  operator: 'any',
                },
              ],
              environments: null,
            },
          ],
          checksPerHour: 0,
          type: 'TEMPORARY',
          typeReason: 'NONE',
        },
      ],
    });
  }),

  http.get('https://statsigapi.net/console/v1/experiments', () => {
    return HttpResponse.json({
      message: 'Experiments listed successfully.',
      data: [
        {
          id: 'classroom',
          name: 'classroom',
          description: '',
          idType: 'userID',
          hypothesis: 'Smarter people will end up in the higher classroom.',
          lastModifiedTime: 1707427635442,
          createdTime: 1707427634717,
          groups: [
            {
              name: 'Class D',
              id: 'mBW0GiuuP4ebFdUaO6ILx',
              size: 25,
              parameterValues: {
                idealism: 75,
                fitness: 'weak',
                skilful: false,
                proficiency: {
                  math: 10,
                  literature: 10,
                  sport: 10,
                },
                standouts: [],
              },
              description: 'Default class.',
            },
            {
              name: 'Class C',
              id: 'mBW0HXwX7dIv4LPLW2m4z',
              size: 25,
              parameterValues: {
                idealism: 40,
                fitness: 'lazy',
                skilful: false,
                proficiency: {
                  math: 30,
                  literature: 30,
                  sport: 40,
                },
                standouts: ['Craftsmanship', 'Basketball'],
              },
              description: 'Above class D.',
            },
            {
              name: 'Class B',
              id: 'KDOAuR5X5BjEik1BqsOCx',
              size: 25,
              parameterValues: {
                idealism: 20,
                fitness: 'fit',
                skilful: true,
                proficiency: {
                  math: 60,
                  literature: 70,
                  sport: 80,
                },
                standouts: ['Chess', 'Aikido'],
              },
              description: 'Above class C.',
            },
            {
              name: 'Class A',
              id: 'KDOAww8pnKNXHRXcyorVz',
              size: 25,
              parameterValues: {
                idealism: 0,
                fitness: 'strong',
                skilful: true,
                proficiency: {
                  math: 100,
                  literature: 100,
                  sport: 100,
                },
                standouts: ['Martial Arts', 'Poetry', 'Politics'],
              },
              description: 'Above class B.',
            },
          ],
          allocation: 100,
          duration: 14,
          targetingGateID: '',
          defaultConfidenceInterval: '95',
          bonferroniCorrection: false,
          decisionReason: null,
          decisionTime: null,
          healthChecks: [],
        },
      ],
    });
  }),
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
          consoleApiKey: 'console-this-is-a-test-token',
          projectId: 'project-id-placeholder',
        }),
      ).resolves.toEqual({
        hints: [],
        definitions: {
          show_high_definition_images: {
            options: [
              { label: 'Off', value: false },
              { label: 'On', value: true },
            ],
            description: 'Show high definition product images',
            origin:
              'https://console.statsig.com/project-id-placeholder/gates/show_high_definition_images',
            createdAt: 1708981092158,
            updatedAt: 1708981874677,
          },
          show_new_product_details: {
            options: [
              { label: 'Off', value: false },
              { label: 'On', value: true },
            ],
            description: 'Shows the new product details.',
            origin:
              'https://console.statsig.com/project-id-placeholder/gates/show_new_product_details',
            createdAt: 1708975725889,
            updatedAt: 1708975899169,
          },
          classroom: {
            description: '',
            origin:
              'https://console.statsig.com/project-id-placeholder/experiments/classroom/setup',
            options: [
              {
                label: 'Class D',
                value: {
                  idealism: 75,
                  fitness: 'weak',
                  skilful: false,
                  proficiency: {
                    math: 10,
                    literature: 10,
                    sport: 10,
                  },
                  standouts: [],
                },
              },
              {
                label: 'Class C',
                value: {
                  idealism: 40,
                  fitness: 'lazy',
                  skilful: false,
                  proficiency: {
                    math: 30,
                    literature: 30,
                    sport: 40,
                  },
                  standouts: ['Craftsmanship', 'Basketball'],
                },
              },
              {
                label: 'Class B',
                value: {
                  idealism: 20,
                  fitness: 'fit',
                  skilful: true,
                  proficiency: {
                    math: 60,
                    literature: 70,
                    sport: 80,
                  },
                  standouts: ['Chess', 'Aikido'],
                },
              },
              {
                label: 'Class A',
                value: {
                  idealism: 0,
                  fitness: 'strong',
                  skilful: true,
                  proficiency: {
                    math: 100,
                    literature: 100,
                    sport: 100,
                  },
                  standouts: ['Martial Arts', 'Poetry', 'Politics'],
                },
              },
            ],
            createdAt: 1707427634717,
            updatedAt: 1707427635442,
          },
        },
      });
    });
  });

  describe('when called with invalid params', () => {
    it('should return appropriate hints', async () => {
      await expect(
        getProviderData({
          consoleApiKey: '',
        }),
      ).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'statsig/missing-api-key',
            text: 'Missing Statsig Console API Key',
          },
        ],
      });
    });
  });
});
