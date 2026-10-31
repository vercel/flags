import { describe, expect, it } from 'vitest';
import type { IWingifyClient } from 'wingify-fme-node-sdk';
import { WINGIFY_FM_ORIGIN } from '../constants';
import {
  getProviderData,
  mergeWingifyExplorerData,
  wingifyVariableExplorerKey,
} from './index';
import { buildVariableValueOptions } from './options';
import {
  createMockCampaign,
  createMockFeature,
  createMockVariable,
  createMockVariation,
  createMockWingifyClient,
  createPlainVariable,
} from './test-mocks';

function asWingifyClient(
  client: ReturnType<typeof createMockWingifyClient>,
): IWingifyClient {
  return client as unknown as IWingifyClient;
}

describe('wingifyVariableExplorerKey', () => {
  it('joins the feature key and variable name with a colon', () => {
    expect(wingifyVariableExplorerKey('checkoutFlow', 'discount')).toBe(
      'checkoutFlow:discount',
    );
  });
});

describe('getProviderData', () => {
  it('maps a feature with no variables to a boolean Disabled/Enabled row', async () => {
    const client = createMockWingifyClient([
      createMockFeature({
        key: 'simpleFlag',
        name: 'Simple Flag',
        campaigns: [createMockCampaign([createMockVariation([])])],
      }),
    ]);

    const providerData = await getProviderData(asWingifyClient(client));

    expect(providerData.hints).toEqual([]);
    expect(providerData.definitions).toEqual({
      simpleFlag: {
        description: 'Simple Flag',
        origin: `${WINGIFY_FM_ORIGIN}?feature=simpleFlag`,
        options: [
          { value: false, label: 'Disabled' },
          { value: true, label: 'Enabled' },
        ],
      },
    });
  });

  it('maps each variable to a feature:variable row with distinct values', async () => {
    const client = createMockWingifyClient([
      createMockFeature({
        key: 'checkoutFlow',
        campaigns: [
          createMockCampaign([
            createMockVariation([
              createMockVariable('cta', 'buy now'),
              createMockVariable('discount', 30),
              createMockVariable('discount', 30),
            ]),
            createMockVariation([
              createMockVariable('cta', 'shop now'),
              createMockVariable('discount', 10),
            ]),
          ]),
        ],
      }),
    ]);

    const providerData = await getProviderData(asWingifyClient(client));
    const definitions = providerData.definitions;

    expect(Object.keys(definitions).sort()).toEqual([
      'checkoutFlow:cta',
      'checkoutFlow:discount',
    ]);
    expect(definitions['checkoutFlow:cta']).toMatchObject({
      description: 'checkoutFlow — cta',
      origin: `${WINGIFY_FM_ORIGIN}?feature=checkoutFlow`,
      options: [
        { value: 'buy now', label: 'buy now' },
        { value: 'shop now', label: 'shop now' },
      ],
    });
    expect(definitions['checkoutFlow:discount']?.options).toEqual([
      { value: 30, label: '30' },
      { value: 10, label: '10' },
    ]);
    expect(definitions.checkoutFlow).toBeUndefined();
  });

  it('reads plain key/value variables and skips null or undefined values', async () => {
    const client = createMockWingifyClient([
      createMockFeature({
        key: 'theme',
        campaigns: [
          createMockCampaign([
            createMockVariation([
              createPlainVariable('color', 'blue') as never,
              createPlainVariable('color', null) as never,
              createPlainVariable('missing', undefined) as never,
            ]),
          ]),
        ],
      }),
    ]);

    const providerData = await getProviderData(asWingifyClient(client));

    expect(Object.keys(providerData.definitions)).toEqual(['theme:color']);
    expect(providerData.definitions['theme:color']?.options).toEqual([
      { value: 'blue', label: 'blue' },
    ]);
  });

  it('labels JSON values as shortened JSON instead of [object Object]', async () => {
    const jsonValue = {
      address: {
        state: 'CA',
        country: 'US',
        city: 'San Francisco',
      },
      age: 30,
      name: 'Test User',
    };
    const client = createMockWingifyClient([
      createMockFeature({
        key: 'checkoutFlow',
        campaigns: [
          createMockCampaign([
            createMockVariation([createMockVariable('jsonvar', jsonValue)]),
          ]),
        ],
      }),
    ]);

    const providerData = await getProviderData(asWingifyClient(client));
    const jsonOption =
      providerData.definitions['checkoutFlow:jsonvar']?.options?.[0];

    expect(jsonOption?.value).toEqual(jsonValue);
    expect(jsonOption?.label).not.toBe('[object Object]');
    expect(jsonOption?.label).toContain('"address"');
    expect(jsonOption?.label?.endsWith('...')).toBe(true);
  });

  it('falls back to Disabled/Enabled when the requested variable has no values', () => {
    const feature = createMockFeature({
      key: 'checkoutFlow',
      campaigns: [
        createMockCampaign([
          createMockVariation([createMockVariable('cta', 'buy now')]),
        ]),
      ],
    });

    expect(buildVariableValueOptions(feature as never, 'missing')).toEqual([
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ]);
  });

  it('labels empty strings and booleans for Explorer dropdowns', async () => {
    const client = createMockWingifyClient([
      createMockFeature({
        key: 'checkoutFlow',
        campaigns: [
          createMockCampaign([
            createMockVariation([
              createMockVariable('cta', '   '),
              createMockVariable('boolvar', true),
              createMockVariable('boolvar', false),
            ]),
          ]),
        ],
      }),
    ]);

    const providerData = await getProviderData(asWingifyClient(client));

    expect(providerData.definitions['checkoutFlow:cta']?.options).toEqual([
      { value: '   ', label: '(empty)' },
    ]);
    expect(providerData.definitions['checkoutFlow:boolvar']?.options).toEqual([
      { value: true, label: 'Enabled' },
      { value: false, label: 'Disabled' },
    ]);
  });
});

describe('mergeWingifyExplorerData', () => {
  it('keeps Wingify options when the code flag does not define any', () => {
    const merged = mergeWingifyExplorerData(
      {
        definitions: {
          'checkoutFlow:cta': {
            description: 'checkoutFlow — cta',
            origin: `${WINGIFY_FM_ORIGIN}?feature=checkoutFlow`,
            options: [{ value: 'buy now', label: 'buy now' }],
          },
        },
        hints: [{ key: 'wingify/info', text: 'from settings' }],
      },
      {
        definitions: {
          'checkoutFlow:cta': {
            description: 'CTA from code',
            origin: WINGIFY_FM_ORIGIN,
          },
        },
        hints: [{ key: 'code/info', text: 'from code' }],
      },
    );

    expect(merged.definitions['checkoutFlow:cta']).toEqual({
      description: 'CTA from code',
      origin: `${WINGIFY_FM_ORIGIN}?feature=checkoutFlow`,
      options: [{ value: 'buy now', label: 'buy now' }],
    });
    expect(merged.hints).toEqual([
      { key: 'wingify/info', text: 'from settings' },
      { key: 'code/info', text: 'from code' },
    ]);
  });

  it('lets code-defined options replace Wingify-generated options', () => {
    const merged = mergeWingifyExplorerData(
      {
        definitions: {
          'checkoutFlow:cta': {
            options: [{ value: 'buy now', label: 'buy now' }],
          },
        },
        hints: [],
      },
      {
        definitions: {
          'checkoutFlow:cta': {
            options: [{ value: 'forced', label: 'Forced' }],
          },
        },
        hints: [],
      },
    );

    expect(merged.definitions['checkoutFlow:cta']?.options).toEqual([
      { value: 'forced', label: 'Forced' },
    ]);
  });

  it('keeps auto-mapped Wingify flags that are not declared in code', () => {
    const merged = mergeWingifyExplorerData(
      {
        definitions: {
          'featureFlag2:f2var': {
            description: 'featureFlag2 — f2var',
            options: [{ value: 'a', label: 'a' }],
          },
        },
        hints: [],
      },
      {
        definitions: {},
        hints: [],
      },
    );

    expect(merged.definitions['featureFlag2:f2var']?.description).toBe(
      'featureFlag2 — f2var',
    );
  });
});
