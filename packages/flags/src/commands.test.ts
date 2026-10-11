import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from './commands';

describe('flags manifest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes the manifest of the modules with the directive', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_shop');
    vi.stubEnv('VERCEL_TARGET_ENV', 'production');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    const dir = mkdtempSync(join(tmpdir(), 'flags-cli-'));
    // The modules import flags, like in an application
    symlinkSync(
      resolve(__dirname, '../../..', 'node_modules'),
      join(dir, 'node_modules'),
    );
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
    writeFileSync(
      join(dir, 'flags.js'),
      `'use flags';\nexport const sale = { key: 'sale', type: 'boolean', defaultValue: false };\n`,
    );

    const output = await runCommand(['manifest', dir]);

    expect(output).toContain('with 1 flags from 1 modules.');
    expect(
      JSON.parse(readFileSync(join(dir, 'flags-manifest.json'), 'utf8')),
    ).toEqual({
      version: 1,
      connections: {
        vercel: {
          platform: 'vercel',
          providerManifest:
            'https://flags-sdk.dev/provider-manifests/vercel.json',
          variables: { projectId: 'prj_shop', environment: 'production' },
        },
      },
      definitions: {
        sale: {
          type: 'boolean',
          defaultValue: false,
          declaredInCode: true,
          connection: 'vercel',
          sources: [{ module: 'flags.js', export: 'sale' }],
        },
      },
    });
  });

  it('rejects an unknown command with the usage', async () => {
    await expect(runCommand(['other'])).rejects.toThrow(
      'Usage: flags manifest [dir] [--out <file>]',
    );
  });
});
