import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { providerManifestUrls } from './connection';
import {
  expandTemplate,
  type ProviderManifest,
  resolveFlagLinks,
  validateProviderManifest,
} from './provider-manifest';

const manifest: ProviderManifest = {
  version: 1,
  name: 'Acme Flags',
  links: {
    flag: 'https://app.acme.dev/{teamId}/{projectId}/flags/{flagKey}',
    createFlag: 'https://app.acme.dev/{teamId}/{projectId}/flags/new',
    project: 'https://app.acme.dev/{teamId}/{projectId}',
  },
};

describe('resolveFlagLinks', () => {
  it('builds the links from the variables of the connection', () => {
    expect(
      resolveFlagLinks(
        manifest,
        { teamId: 'acme', projectId: 'shop' },
        'summer-sale',
      ),
    ).toEqual({
      flag: 'https://app.acme.dev/acme/shop/flags/summer-sale',
      createFlag: 'https://app.acme.dev/acme/shop/flags/new',
      project: 'https://app.acme.dev/acme/shop',
    });
  });

  it('encodes the values, so a value can not change the path', () => {
    expect(
      resolveFlagLinks(manifest, { teamId: 'a/b', projectId: 'x?y' }, 'k#1')
        .flag,
    ).toBe('https://app.acme.dev/a%2Fb/x%3Fy/flags/k%231');
  });

  it('leaves out a link whose variables are not known', () => {
    expect(resolveFlagLinks(manifest, { projectId: 'shop' }, 'a')).toEqual({});
  });
});

describe('validateProviderManifest', () => {
  it.each([
    ['a placeholder in the origin', 'https://{teamId}.acme.dev/flags'],
    ['a URL which is not HTTPS', 'http://app.acme.dev/{projectId}'],
    ['credentials', 'https://user:pass@app.acme.dev/{projectId}'],
    ['a fragment', 'https://app.acme.dev/{projectId}#x'],
  ])('rejects a link with %s', (_, flag) => {
    expect(() =>
      validateProviderManifest({ ...manifest, links: { flag } }),
    ).toThrow(
      'flags: The link "flag" of the provider manifest must be an HTTPS URL',
    );
  });

  it('rejects a manifest without version 1 or a name', () => {
    expect(() =>
      validateProviderManifest({ version: 2, name: 'x', links: {} }),
    ).toThrow('flags: The provider manifest is not valid.');
    expect(() => validateProviderManifest({ version: 1, links: {} })).toThrow(
      'flags: The provider manifest is not valid.',
    );
  });
});

describe('expandTemplate', () => {
  it('returns undefined for an empty value', () => {
    expect(
      expandTemplate('https://acme.dev/{projectId}', { projectId: '' }),
    ).toBeUndefined();
  });
});

describe('the provider manifests which the SDK hosts', () => {
  // apps/docs publishes them at https://flags-sdk.dev/provider-manifests/
  const hosted = (platform: string) =>
    JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          `../../../apps/docs/public/provider-manifests/${platform}.json`,
        ),
        'utf8',
      ),
    );

  it.each(
    Object.entries(providerManifestUrls).filter(([, url]) => url),
  )('has a valid file for %s', (platform, url) => {
    expect(url).toBe(
      `https://flags-sdk.dev/provider-manifests/${platform}.json`,
    );
    const file = validateProviderManifest(hosted(platform));
    expect(file.$schema).toBe(
      'https://flags-sdk.dev/schemas/provider-manifest.v1.json',
    );
    // Each placeholder is a declared variable, or flagKey
    for (const template of Object.values(file.links)) {
      for (const [, name] of (template as string).matchAll(/\{(\w+)\}/g)) {
        expect(
          name === 'flagKey' ||
            Object.hasOwn(file.variables ?? {}, name as string),
        ).toBe(true);
      }
    }
  });

  it('builds the link of a LaunchDarkly flag, as v4', () => {
    expect(
      resolveFlagLinks(
        hosted('launchdarkly'),
        { projectId: 'shop', environment: 'production' },
        'sale',
      ),
    ).toEqual({
      flag: 'https://app.launchdarkly.com/shop/production/features/sale/targeting',
    });
  });

  it('builds the link of a Vercel flag', () => {
    expect(
      resolveFlagLinks(
        hosted('vercel'),
        { teamId: 'team_1', projectId: 'prj_1', environment: 'production' },
        'sale',
      ),
    ).toEqual({ flag: 'https://vercel.com/team_1/prj_1/flag/sale' });
  });
});
