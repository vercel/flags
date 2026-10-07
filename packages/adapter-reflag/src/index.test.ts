import { ReflagClient } from '@reflag/node-sdk';
import { mergeProviderData } from 'flags';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReflagAdapter, getProviderData } from './index';

afterEach(() => vi.restoreAllMocks());

describe('discovery metadata', () => {
  it('links evaluated flags and provider definitions to the Reflag dashboard', async () => {
    const reflagClient = new ReflagClient({ offline: true });
    vi.spyOn(reflagClient, 'getFlagDefinitions').mockReturnValue([
      {
        key: 'welcome_message',
        description: 'Welcome',
        flag: { version: 1, rules: [] },
      },
      {
        key: 'show_banner',
        description: null,
        flag: { version: 1, rules: [] },
      },
    ]);
    const data = await getProviderData({ reflagClient });

    expect(data.definitions.welcome_message).toEqual({
      description: 'Welcome',
      origin: 'https://app.reflag.com',
      options: [
        { label: 'Disabled', value: false },
        { label: 'Enabled', value: true },
      ],
    });
    expect(data.definitions.show_banner?.origin).toBe('https://app.reflag.com');
    expect(createReflagAdapter({ offline: true }).isEnabled().origin).toBe(
      'https://app.reflag.com',
    );
  });

  it('preserves local descriptions when absent in Reflag and prefers remote descriptions when present', async () => {
    const reflagClient = new ReflagClient({ offline: true });
    vi.spyOn(reflagClient, 'getFlagDefinitions').mockReturnValue([
      {
        key: 'welcome_message',
        description: null,
        flag: { version: 1, rules: [] },
      },
      {
        key: 'show_banner',
        description: 'Description from Reflag',
        flag: { version: 1, rules: [] },
      },
      {
        key: 'free_delivery',
        description: null,
        flag: { version: 1, rules: [] },
      },
    ]);

    const data = await mergeProviderData([
      {
        definitions: {
          welcome_message: {
            description: 'Local welcome description',
            defaultValue: false,
            declaredInCode: true,
          },
          show_banner: { description: 'Local banner description' },
        },
        hints: [],
      },
      getProviderData({ reflagClient }),
    ]);

    expect(data.definitions.welcome_message).toMatchObject({
      description: 'Local welcome description',
      defaultValue: false,
      declaredInCode: true,
      origin: 'https://app.reflag.com',
    });
    expect(data.definitions.show_banner?.description).toBe(
      'Description from Reflag',
    );
    expect(data.definitions.free_delivery).not.toHaveProperty('description');
    expect(data.definitions.free_delivery?.origin).toBe(
      'https://app.reflag.com',
    );
  });
});
