import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { format, runCommand } from './commands';

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
      `'use flags';\nconst source = { project: { system: 'vercel-flags' } };\nexport const sale = { key: 'sale', type: 'boolean', defaultValue: false, source };\n`,
    );

    const output = await runCommand(['manifest', dir]);

    expect(output).toContain('with 1 flags from 1 modules.');
    expect(
      JSON.parse(readFileSync(join(dir, 'flags-manifest.json'), 'utf8')),
    ).toEqual({
      version: 1,
      sources: {
        'vercel-flags': {
          system: 'vercel-flags',
          systemManifest:
            'https://flags-sdk.dev/system-manifests/vercel-flags.json',
          variables: { projectId: 'prj_shop', environment: 'production' },
        },
      },
      definitions: {
        sale: {
          type: 'boolean',
          defaultValue: false,
          declaredInCode: true,
          source: 'vercel-flags',
          declarations: [{ module: 'flags.js', export: 'sale' }],
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

describe('flags format', () => {
  it('formats the flags files of a folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flags-format-'));
    writeFileSync(join(dir, 'app.flags'), 'flag a {key:"a"}');
    writeFileSync(join(dir, 'done.flags'), 'flag b\n');

    await expect(runCommand(['format', '--check', dir])).rejects.toThrow(
      'flags: These flags files are not formatted. Run flags format.',
    );
    expect(readFileSync(join(dir, 'app.flags'), 'utf8')).toBe(
      'flag a {key:"a"}',
    );

    expect(await runCommand(['format', dir])).toBe(
      'flags: Formatted 1 of 2 flags files.',
    );
    expect(readFileSync(join(dir, 'app.flags'), 'utf8')).toBe(
      'flag a { key: "a" }\n',
    );
    expect(await runCommand(['format', '--check', dir])).toBe(
      'flags: No changes in 2 flags files.',
    );
  });

  it('formats the standard input to the standard output', async () => {
    let output = '';
    const streams = {
      read: async () => 'source  self\nflag a',
      write: (text: string) => {
        output += text;
      },
    };

    expect(await format(['--stdin'], streams)).toBe('');
    expect(output).toBe('source self\n\nflag a\n');
  });

  it('shows the syntax error and writes nothing', async () => {
    const write = vi.fn();
    const streams = { read: async () => 'flag a {\n  key: tru\n}', write };

    await expect(
      format(['--stdin', '--stdin-filepath', 'app.flags'], streams),
    ).rejects.toThrow(
      'flags: app.flags has a syntax error, so it can not be formatted.\n\napp.flags:2:8 - error:',
    );
    expect(write).not.toHaveBeenCalled();
  });
});
