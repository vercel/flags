import { expect, it, describe } from 'vitest';
import { getOptimizelyData } from '.';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http } from 'msw';

const restHandlers = [
  http.get(`https://api.optimizely.com/flags/v1/projects/1000000/flags`, () => {
    return HttpResponse.json({
      count: 1,
      total_pages: 1,
      last_url: '/projects/1000000/flags',
      url: '/projects/1000000/flags',
      total_count: 1,
      page: 1,
      fetch_flag_url: '/projects/1000000/flags/{flag_key}',
      first_url: '/projects/1000000/flags',
      items: [
        {
          key: 'some-flag-key',
          name: 'some-flag-key',
          description:
            'A feature flag to control how products are returned in the Product Listing page.',
          url: '/projects/1000000/flags/some-flag-key',
          update_url: '/projects/1000000/flags',
          delete_url: '/projects/1000000/flags/some-flag-key',
          archive_url: '/projects/1000000/flags/archived',
          variable_definitions: {
            double_variable: {
              key: 'double_variable',
              description: 'Example double variable.',
              type: 'double',
              default_value: '3.5',
              created_time: '2024-03-04T20:19:20.096313Z',
              updated_time: '2024-03-04T20:19:20.096318Z',
            },
            integer_variable: {
              key: 'integer_variable',
              description: 'Example integer variable.',
              type: 'integer',
              default_value: '0',
              created_time: '2024-03-04T20:18:55.619144Z',
              updated_time: '2024-03-04T20:18:55.619149Z',
            },
            json_variable: {
              key: 'json_variable',
              description: 'Example JSON variable',
              type: 'json',
              default_value:
                '{\n\t"prop": 12,\n  "prop2": true,\n  "prop3": 12.21,\n  "prop4": [1,2,3]\n}',
              created_time: '2024-03-04T20:20:12.920959Z',
              updated_time: '2024-03-04T20:20:12.920964Z',
            },
            location_input_for_algorithm: {
              key: 'location_input_for_algorithm',
              description:
                'Trigger different algorithms based on the location the user is browsing from.',
              type: 'boolean',
              default_value: 'false',
              created_time: '2024-02-29T17:07:52.650212Z',
              updated_time: '2024-02-29T17:07:52.650215Z',
            },
            product_source: {
              key: 'product_source',
              description:
                'The source of the products.  Local file is the default.  Variations can be GraphQL, etc.',
              type: 'string',
              default_value: 'local',
              created_time: '2024-02-29T17:07:52.650215Z',
              updated_time: '2024-02-29T17:07:52.650216Z',
            },
            sort_field: {
              key: 'sort_field',
              description: 'The sort order for the products.',
              type: 'string',
              default_value: 'title',
              created_time: '2024-02-29T17:07:52.650216Z',
              updated_time: '2024-02-29T17:07:52.650217Z',
            },
          },
          environments: {
            production: {
              key: 'production',
              name: 'Production',
              enabled: true,
              priority: 1,
              rules_summary: {
                targeted_delivery: {
                  keys: ['rollout'],
                },
              },
              disable_url:
                '/projects/1000000/flags/some-flag-key/environments/production/ruleset/disabled',
            },
            development: {
              key: 'development',
              name: 'Development',
              enabled: false,
              priority: 2,
              rules_summary: {},
              enable_url:
                '/projects/1000000/flags/some-flag-key/environments/development/ruleset/enabled',
            },
          },
          id: 127366,
          urn: 'flags.flags.optimizely.com::127366',
          archived: false,
          outlier_filtering_enabled: false,
          project_id: 1000000,
          created_by_user_id: 'andy@example.com',
          account_id: 1000000,
          created_time: '2024-02-29T17:07:52.647648Z',
          updated_time: '2024-03-04T20:20:12.918223Z',
          revision: 1,
        },
      ],
      create_url: '/projects/1000000/flags',
    });
  }),

  http.get(
    `https://api.optimizely.com/flags/v1/projects/1000000/flags/some-flag-key/variations`,
    () => {
      return HttpResponse.json({
        last_url: '/projects/1000000/flags/some-flag-key/variations',
        page: 1,
        create_url: '/projects/1000000/flags/some-flag-key/variations',
        total_count: 6,
        count: 6,
        url: '/projects/1000000/flags/some-flag-key/variations',
        total_pages: 1,
        fetch_variation_url:
          '/projects/1000000/flags/some-flag-key/variations/{variation_key}',
        items: [
          {
            key: 'ml_location',
            name: 'ML Location',
            description:
              'Sort using a different algorithm depdening on the location of the user.',
            variables: {
              location_input_for_algorithm: {
                key: 'location_input_for_algorithm',
                type: 'boolean',
                value: 'true',
                is_default: false,
              },
              double_variable: {
                key: 'double_variable',
                type: 'double',
                value: '3.5',
                is_default: true,
              },
              integer_variable: {
                key: 'integer_variable',
                type: 'integer',
                value: '0',
                is_default: true,
              },
              json_variable: {
                key: 'json_variable',
                type: 'json',
                value:
                  '{\n\t"prop": 12,\n  "prop2": true,\n  "prop3": 12.21,\n  "prop4": [1,2,3]\n}',
                is_default: true,
              },
              product_source: {
                key: 'product_source',
                type: 'string',
                value: 'local',
                is_default: true,
              },
              sort_field: {
                key: 'sort_field',
                type: 'string',
                value: 'title',
                is_default: true,
              },
            },
            id: 400011,
            urn: 'variations.flags.optimizely.com::400011',
            flag_key: 'some-flag-key',
            environment_usage_count: {
              production: 1,
            },
            archived: false,
            enabled: true,
            in_use: true,
            created_time: '2024-02-29T17:08:02.601584Z',
            updated_time: '2024-02-29T17:08:02.601590Z',
            url: '/projects/1000000/flags/some-flag-key/variations/ml_location',
            update_url: '/projects/1000000/flags/some-flag-key/variations',
            delete_url:
              '/projects/1000000/flags/some-flag-key/variations/ml_location',
            archive_url:
              '/projects/1000000/flags/some-flag-key/variations/archived',
            fetch_flag_url: '/projects/1000000/flags/some-flag-key',
            revision: 1,
          },
          {
            key: 'sort_by_price_descending',
            name: 'Sort By Price Descending',
            description: 'Sort by price in descending order.',
            variables: {
              sort_field: {
                key: 'sort_field',
                type: 'string',
                value: 'price_descending',
                is_default: false,
              },
              double_variable: {
                key: 'double_variable',
                type: 'double',
                value: '3.5',
                is_default: true,
              },
              integer_variable: {
                key: 'integer_variable',
                type: 'integer',
                value: '0',
                is_default: true,
              },
              json_variable: {
                key: 'json_variable',
                type: 'json',
                value:
                  '{\n\t"prop": 12,\n  "prop2": true,\n  "prop3": 12.21,\n  "prop4": [1,2,3]\n}',
                is_default: true,
              },
              location_input_for_algorithm: {
                key: 'location_input_for_algorithm',
                type: 'boolean',
                value: 'false',
                is_default: true,
              },
              product_source: {
                key: 'product_source',
                type: 'string',
                value: 'local',
                is_default: true,
              },
            },
            id: 400010,
            urn: 'variations.flags.optimizely.com::400010',
            flag_key: 'some-flag-key',
            environment_usage_count: {},
            archived: false,
            enabled: true,
            in_use: false,
            created_time: '2024-02-29T17:08:00.348971Z',
            updated_time: '2024-02-29T17:08:00.348976Z',
            url: '/projects/1000000/flags/some-flag-key/variations/sort_by_price_descending',
            update_url: '/projects/1000000/flags/some-flag-key/variations',
            delete_url:
              '/projects/1000000/flags/some-flag-key/variations/sort_by_price_descending',
            archive_url:
              '/projects/1000000/flags/some-flag-key/variations/archived',
            fetch_flag_url: '/projects/1000000/flags/some-flag-key',
            revision: 1,
          },
          {
            key: 'sort_by_price_ascending',
            name: 'Sort By Price Ascending',
            description: 'Sort by price in ascending order.',
            variables: {
              sort_field: {
                key: 'sort_field',
                type: 'string',
                value: 'price_ascending',
                is_default: false,
              },
              double_variable: {
                key: 'double_variable',
                type: 'double',
                value: '3.5',
                is_default: true,
              },
              integer_variable: {
                key: 'integer_variable',
                type: 'integer',
                value: '0',
                is_default: true,
              },
              json_variable: {
                key: 'json_variable',
                type: 'json',
                value:
                  '{\n\t"prop": 12,\n  "prop2": true,\n  "prop3": 12.21,\n  "prop4": [1,2,3]\n}',
                is_default: true,
              },
              location_input_for_algorithm: {
                key: 'location_input_for_algorithm',
                type: 'boolean',
                value: 'false',
                is_default: true,
              },
              product_source: {
                key: 'product_source',
                type: 'string',
                value: 'local',
                is_default: true,
              },
            },
            id: 400009,
            urn: 'variations.flags.optimizely.com::400009',
            flag_key: 'some-flag-key',
            environment_usage_count: {},
            archived: false,
            enabled: true,
            in_use: false,
            created_time: '2024-02-29T17:07:57.989687Z',
            updated_time: '2024-02-29T17:07:57.989708Z',
            url: '/projects/1000000/flags/some-flag-key/variations/sort_by_price_ascending',
            update_url: '/projects/1000000/flags/some-flag-key/variations',
            delete_url:
              '/projects/1000000/flags/some-flag-key/variations/sort_by_price_ascending',
            archive_url:
              '/projects/1000000/flags/some-flag-key/variations/archived',
            fetch_flag_url: '/projects/1000000/flags/some-flag-key',
            revision: 1,
          },
          {
            key: 'sort_by_top_sellers',
            name: 'Sort By Top Sellers',
            description: 'Sort by top sellers first.',
            variables: {
              sort_field: {
                key: 'sort_field',
                type: 'string',
                value: 'top_sellers',
                is_default: false,
              },
              double_variable: {
                key: 'double_variable',
                type: 'double',
                value: '3.5',
                is_default: true,
              },
              integer_variable: {
                key: 'integer_variable',
                type: 'integer',
                value: '0',
                is_default: true,
              },
              json_variable: {
                key: 'json_variable',
                type: 'json',
                value:
                  '{\n\t"prop": 12,\n  "prop2": true,\n  "prop3": 12.21,\n  "prop4": [1,2,3]\n}',
                is_default: true,
              },
              location_input_for_algorithm: {
                key: 'location_input_for_algorithm',
                type: 'boolean',
                value: 'false',
                is_default: true,
              },
              product_source: {
                key: 'product_source',
                type: 'string',
                value: 'local',
                is_default: true,
              },
            },
            id: 400008,
            urn: 'variations.flags.optimizely.com::400008',
            flag_key: 'some-flag-key',
            environment_usage_count: {},
            archived: false,
            enabled: true,
            in_use: false,
            created_time: '2024-02-29T17:07:55.507113Z',
            updated_time: '2024-02-29T17:07:55.507118Z',
            url: '/projects/1000000/flags/some-flag-key/variations/sort_by_top_sellers',
            update_url: '/projects/1000000/flags/some-flag-key/variations',
            delete_url:
              '/projects/1000000/flags/some-flag-key/variations/sort_by_top_sellers',
            archive_url:
              '/projects/1000000/flags/some-flag-key/variations/archived',
            fetch_flag_url: '/projects/1000000/flags/some-flag-key',
            revision: 1,
          },
          {
            key: 'sort_by_new_products',
            name: 'Sort By New Products',
            description: 'Sort products by newest first.',
            variables: {
              sort_field: {
                key: 'sort_field',
                type: 'string',
                value: 'new_products',
                is_default: false,
              },
              double_variable: {
                key: 'double_variable',
                type: 'double',
                value: '3.5',
                is_default: true,
              },
              integer_variable: {
                key: 'integer_variable',
                type: 'integer',
                value: '0',
                is_default: true,
              },
              json_variable: {
                key: 'json_variable',
                type: 'json',
                value:
                  '{\n\t"prop": 12,\n  "prop2": true,\n  "prop3": 12.21,\n  "prop4": [1,2,3]\n}',
                is_default: true,
              },
              location_input_for_algorithm: {
                key: 'location_input_for_algorithm',
                type: 'boolean',
                value: 'false',
                is_default: true,
              },
              product_source: {
                key: 'product_source',
                type: 'string',
                value: 'local',
                is_default: true,
              },
            },
            id: 400007,
            urn: 'variations.flags.optimizely.com::400007',
            flag_key: 'some-flag-key',
            environment_usage_count: {},
            archived: false,
            enabled: true,
            in_use: false,
            created_time: '2024-02-29T17:07:54.301256Z',
            updated_time: '2024-02-29T17:07:54.301263Z',
            url: '/projects/1000000/flags/some-flag-key/variations/sort_by_new_products',
            update_url: '/projects/1000000/flags/some-flag-key/variations',
            delete_url:
              '/projects/1000000/flags/some-flag-key/variations/sort_by_new_products',
            archive_url:
              '/projects/1000000/flags/some-flag-key/variations/archived',
            fetch_flag_url: '/projects/1000000/flags/some-flag-key',
            revision: 1,
          },
          {
            key: 'off',
            name: 'Off',
            description: '',
            variables: {
              double_variable: {
                key: 'double_variable',
                type: 'double',
                value: '3.5',
                is_default: true,
              },
              integer_variable: {
                key: 'integer_variable',
                type: 'integer',
                value: '0',
                is_default: true,
              },
              json_variable: {
                key: 'json_variable',
                type: 'json',
                value:
                  '{\n\t"prop": 12,\n  "prop2": true,\n  "prop3": 12.21,\n  "prop4": [1,2,3]\n}',
                is_default: true,
              },
              location_input_for_algorithm: {
                key: 'location_input_for_algorithm',
                type: 'boolean',
                value: 'false',
                is_default: true,
              },
              product_source: {
                key: 'product_source',
                type: 'string',
                value: 'local',
                is_default: true,
              },
              sort_field: {
                key: 'sort_field',
                type: 'string',
                value: 'title',
                is_default: true,
              },
            },
            id: 400005,
            urn: 'variations.flags.optimizely.com::400005',
            flag_key: 'some-flag-key',
            environment_usage_count: {
              development: 1,
              production: 1,
            },
            archived: false,
            enabled: false,
            in_use: true,
            created_time: '2024-02-29T17:07:52.679408Z',
            updated_time: '2024-02-29T17:07:52.679412Z',
            url: '/projects/1000000/flags/some-flag-key/variations/off',
            update_url: '/projects/1000000/flags/some-flag-key/variations',
            delete_url: '/projects/1000000/flags/some-flag-key/variations/off',
            archive_url:
              '/projects/1000000/flags/some-flag-key/variations/archived',
            fetch_flag_url: '/projects/1000000/flags/some-flag-key',
            revision: 1,
          },
        ],
        update_url: '/projects/1000000/flags/some-flag-key/variations',
        first_url: '/projects/1000000/flags/some-flag-key/variations',
      });
    },
  ),
];

const server = setupServer(...restHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('getOptimizelyData', () => {
  describe('when called with valid params', () => {
    it('should fetch and return', async () => {
      await expect(
        getOptimizelyData({
          apiKey: 'test-api-key',
          projectId: '1000000',
        }),
      ).resolves.toEqual({
        hints: [],
        definitions: {
          'some-flag-key': {
            description:
              'A feature flag to control how products are returned in the Product Listing page.',
            options: [
              {
                label: 'ML Location',
                value: {
                  variationKey: 'ml_location',
                  enabled: true,
                  flagKey: 'some-flag-key',
                  variables: {
                    location_input_for_algorithm: true,
                    double_variable: 3.5,
                    integer_variable: 0,
                    json_variable: {
                      prop: 12,
                      prop2: true,
                      prop3: 12.21,
                      prop4: [1, 2, 3],
                    },
                    product_source: 'local',
                    sort_field: 'title',
                  },
                },
              },
              {
                label: 'Sort By Price Descending',
                value: {
                  variationKey: 'sort_by_price_descending',
                  enabled: true,
                  flagKey: 'some-flag-key',
                  variables: {
                    sort_field: 'price_descending',
                    double_variable: 3.5,
                    integer_variable: 0,
                    json_variable: {
                      prop: 12,
                      prop2: true,
                      prop3: 12.21,
                      prop4: [1, 2, 3],
                    },
                    location_input_for_algorithm: false,
                    product_source: 'local',
                  },
                },
              },
              {
                label: 'Sort By Price Ascending',
                value: {
                  variationKey: 'sort_by_price_ascending',
                  enabled: true,
                  flagKey: 'some-flag-key',
                  variables: {
                    sort_field: 'price_ascending',
                    double_variable: 3.5,
                    integer_variable: 0,
                    json_variable: {
                      prop: 12,
                      prop2: true,
                      prop3: 12.21,
                      prop4: [1, 2, 3],
                    },
                    location_input_for_algorithm: false,
                    product_source: 'local',
                  },
                },
              },
              {
                label: 'Sort By Top Sellers',
                value: {
                  variationKey: 'sort_by_top_sellers',
                  enabled: true,
                  flagKey: 'some-flag-key',
                  variables: {
                    sort_field: 'top_sellers',
                    double_variable: 3.5,
                    integer_variable: 0,
                    json_variable: {
                      prop: 12,
                      prop2: true,
                      prop3: 12.21,
                      prop4: [1, 2, 3],
                    },
                    location_input_for_algorithm: false,
                    product_source: 'local',
                  },
                },
              },
              {
                label: 'Sort By New Products',
                value: {
                  variationKey: 'sort_by_new_products',
                  enabled: true,
                  flagKey: 'some-flag-key',
                  variables: {
                    sort_field: 'new_products',
                    double_variable: 3.5,
                    integer_variable: 0,
                    json_variable: {
                      prop: 12,
                      prop2: true,
                      prop3: 12.21,
                      prop4: [1, 2, 3],
                    },
                    location_input_for_algorithm: false,
                    product_source: 'local',
                  },
                },
              },
              {
                label: 'Off',
                value: {
                  variationKey: 'off',
                  enabled: true,
                  flagKey: 'some-flag-key',
                  variables: {
                    double_variable: 3.5,
                    integer_variable: 0,
                    json_variable: {
                      prop: 12,
                      prop2: true,
                      prop3: 12.21,
                      prop4: [1, 2, 3],
                    },
                    location_input_for_algorithm: false,
                    product_source: 'local',
                    sort_field: 'title',
                  },
                },
              },
            ],
            origin:
              'https://app.optimizely.com/v2/projects/1000000/flags/manage/some-flag-key/rules/production',
            createdAt: 1709226472647,
            updatedAt: 1709583612918,
          },
        },
      });
    });
  });

  describe('when called with invalid params', () => {
    it('should return appropriate hints', async () => {
      // @ts-expect-error this is the case we are testing
      await expect(getOptimizelyData({})).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'optimizely/missing-api-key',
            text: 'Missing Optimizely Admin API Key',
          },
          {
            key: 'optimizely/missing-project-id',
            text: 'Missing Optimizely Project Id',
          },
        ],
      });
    });
  });
});
