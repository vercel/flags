import { describe, expect, it, vi } from 'vitest';
import * as defaultExports from './index.default';
import * as nextJsExports from './index.next-js';
import { Comparator } from './types';

// Keep public-client evaluations local, including telemetry on shutdown.
vi.mock('./utils/ingest', () => ({
  sendIngestEvents: vi.fn().mockResolvedValue(undefined),
}));

const { flagsClient } = defaultExports;

describe('index exports equivalence', () => {
  it('should have equivalent exports between index.default.ts and index.next-js.ts', () => {
    const defaultKeys = Object.keys(defaultExports).sort();
    const nextJsKeys = Object.keys(nextJsExports).sort();

    expect(nextJsKeys).toEqual(defaultKeys);
  });
});

describe('flagsClient', () => {
  it('works', () => {
    process.env.FLAGS = 'vf_server_testkey';
    process.env.VERCEL_ENV = 'development';
    expect(flagsClient).toBeDefined();
    delete process.env.VERCEL_ENV;
  });
});

describe('createClient regex conditions', () => {
  it.each([
    'gy',
    'yg',
  ])('keeps denylist results independent across identities with flags "%s"', async (flags) => {
    const client = defaultExports.createClient({
      buildStep: true,
      datafile: {
        projectId: 'prj_regex_test',
        environment: 'production',
        definitions: {
          access: {
            seed: undefined,
            environments: {
              production: {
                rules: [
                  {
                    conditions: [
                      [
                        ['user', 'id'],
                        Comparator.NOT_REGEX,
                        { type: 'regex', pattern: '^banned-', flags },
                      ],
                    ],
                    outcome: 1,
                  },
                ],
                fallthrough: 0,
              },
            },
            variants: [false, true],
          },
        },
      },
    });

    try {
      for (const id of ['banned-alice', 'banned-bob', 'banned-bob']) {
        expect(
          (await client.evaluate('access', false, { user: { id } })).value,
        ).toBe(false);
      }
      expect(
        (
          await client.evaluate('access', false, {
            user: { id: 'allowed-carol' },
          })
        ).value,
      ).toBe(true);
    } finally {
      await client.shutdown();
    }
  });
});
