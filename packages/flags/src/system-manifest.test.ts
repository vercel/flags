import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { systemManifestUrls } from './connection';
import {
  expandTemplate,
  resolveFlagLinks,
  type SystemManifest,
  validateSystemManifest,
} from './system-manifest';

const manifest: SystemManifest = {
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

describe('validateSystemManifest', () => {
  it.each([
    ['a placeholder in the origin', 'https://{teamId}.acme.dev/flags'],
    ['a URL which is not HTTPS', 'http://app.acme.dev/{projectId}'],
    ['credentials', 'https://user:pass@app.acme.dev/{projectId}'],
    ['a fragment', 'https://app.acme.dev/{projectId}#x'],
  ])('rejects a link with %s', (_, flag) => {
    expect(() =>
      validateSystemManifest({ ...manifest, links: { flag } }),
    ).toThrow(
      'flags: The link "flag" of the system manifest must be an HTTPS URL',
    );
  });

  it('rejects a manifest without version 1 or a name', () => {
    expect(() =>
      validateSystemManifest({ version: 2, name: 'x', links: {} }),
    ).toThrow('flags: The system manifest is not valid.');
    expect(() => validateSystemManifest({ version: 1, links: {} })).toThrow(
      'flags: The system manifest is not valid.',
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

describe('the system manifests which the SDK hosts', () => {
  // apps/docs publishes them at https://flags-sdk.dev/system-manifests/
  const hosted = (system: string) =>
    JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          `../../../apps/docs/public/system-manifests/${system}.json`,
        ),
        'utf8',
      ),
    );

  it.each(
    Object.entries(systemManifestUrls).filter(([, url]) => url),
  )('has a valid file for %s', (system, url) => {
    expect(url).toBe(`https://flags-sdk.dev/system-manifests/${system}.json`);
    const file = validateSystemManifest(hosted(system));
    expect(file.$schema).toBe(
      'https://flags-sdk.dev/schemas/system-manifest.v1.json',
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
        hosted('vercel-flags'),
        { teamId: 'team_1', projectId: 'prj_1', environment: 'production' },
        'sale',
      ),
    ).toEqual({
      flag: 'https://vercel.com/team_1/prj_1/flag/sale',
      createFlag: 'https://vercel.com/team_1/prj_1/flags?create=1',
    });
  });
});
