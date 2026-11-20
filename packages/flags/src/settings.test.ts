import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findConfigModules, readSettings } from './config-file';
import { configFromModules } from './config-module';
import { runtime } from './runtime';
import { parseSettings } from './settings';

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

async function app(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'flags-settings-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

describe('parseSettings', () => {
  it('accepts the known settings and $schema', () => {
    expect(
      parseSettings({ $schema: 'https://example.com', selfSource: false }),
    ).toEqual({ selfSource: false });
    expect(parseSettings({})).toEqual({});
  });

  it('rejects an unknown setting, a wrong type and a non-object', () => {
    expect(() => parseSettings({ selfsource: true })).toThrow(
      'flags: flags/config.json has the unknown setting "selfsource". The settings are: selfSource.',
    );
    expect(() => parseSettings({ selfSource: 'no' })).toThrow(
      'selfSource in flags/config.json must be true or false',
    );
    expect(() => parseSettings([])).toThrow('must contain a JSON object');
  });

  it('is also checked by runtime.configure', () => {
    expect(() =>
      runtime.configure({ settings: { unknown: 1 } as never }),
    ).toThrow('has the unknown setting "unknown"');
  });
});

describe('the files of the configuration', () => {
  it('finds hooks.ts, overrides.ts and config.json in flags or src/flags', async () => {
    const directory = await app();
    await mkdir(path.join(directory, 'flags'));
    await mkdir(path.join(directory, 'src/flags'), { recursive: true });
    await writeFile(path.join(directory, 'flags/hooks.ts'), '');
    await writeFile(path.join(directory, 'src/flags/overrides.mts'), '');
    await writeFile(path.join(directory, 'src/flags/config.json'), '{}');

    expect(findConfigModules(directory)).toEqual({
      'flags/hooks': path.join(directory, 'flags/hooks.ts'),
      'flags/overrides': path.join(directory, 'src/flags/overrides.mts'),
      'flags/settings': path.join(directory, 'src/flags/config.json'),
    });
  });

  it('reads the settings, with the defaults without the file', async () => {
    const directory = await app();
    expect(readSettings(directory)).toEqual({});

    await mkdir(path.join(directory, 'flags'));
    await writeFile(
      path.join(directory, 'flags/config.json'),
      '{ "selfSource": false }',
    );
    expect(readSettings(directory)).toEqual({ selfSource: false });
  });

  it('fails for a config.json which is not JSON', async () => {
    const directory = await app();
    await mkdir(path.join(directory, 'flags'));
    await writeFile(path.join(directory, 'flags/config.json'), '{ selfSource');

    expect(() => readSettings(directory)).toThrow('is not valid JSON');
  });
});

describe('configFromModules', () => {
  const hooks = { default: [] };
  const settings = { default: { selfSource: false } };

  it('returns the same object while the modules do not change', () => {
    const first = configFromModules([hooks, {}, settings]);

    expect(configFromModules([hooks, {}, settings])).toBe(first);
    expect(first).toEqual({ hooks: [], settings: { selfSource: false } });
    expect(configFromModules([{ default: [] }, {}, settings])).not.toBe(first);
  });
});
