import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../controller/auth';

const legacy = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@vercel/flags-definitions', () => legacy);

const definitions = {
  definitions: {},
  configUpdatedAt: 123,
  fetchedAt: 456,
  digest: 'snapshot',
  revision: 1,
};
const auth: Auth = {
  resolveToken: async () => 'token',
  getStaticBundledDefinitionsLookup: () => undefined,
  resolveBundledDefinitionsLookup: async () => ({
    type: 'project-id',
    projectId: 'prj_test',
  }),
};

describe('filesystem definitions', () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    vi.resetModules();
    legacy.get.mockReset().mockReturnValue(null);
    directory = await mkdtemp(join(tmpdir(), 'flags-snapshot-'));
    path = join(directory, 'definitions.json');
    vi.stubEnv('VERCEL_FLAGS_DEFINITIONS_PATH', path);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  async function read(input: Auth = auth) {
    const { readBundledDefinitions } = await import(
      './read-bundled-definitions'
    );
    return readBundledDefinitions(input);
  }

  async function write(entries: Record<string, unknown>) {
    await writeFile(path, JSON.stringify({ version: 1, entries }));
  }

  it('reads a project snapshot without loading the generated package', async () => {
    await write({ prj_test: definitions });
    expect(await read()).toEqual({ state: 'ok', definitions });
    expect(legacy.get).not.toHaveBeenCalled();
  });

  it.each([
    true,
    false,
  ])('evaluates from the snapshot with the network unavailable (buildStep=%s)', async (buildStep) => {
    const sdkKey = 'vf_server_offline';
    const key = createHash('sha256').update(sdkKey).digest('hex');
    await write({
      [key]: {
        ...definitions,
        projectId: 'prj_test',
        environment: 'production',
        definitions: {
          offline: { variants: [false, true], environments: { production: 1 } },
        },
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { createClient } = await import('../index.default');
    const client = createClient(sdkKey, {
      stream: false,
      polling: false,
      buildStep,
      vercel: false,
    });
    try {
      expect(await client.evaluate('offline', false)).toMatchObject({
        value: true,
      });
      expect(legacy.get).not.toHaveBeenCalled();
    } finally {
      await client.shutdown();
    }
  });

  it('looks up SDK keys by their SHA-256 hash', async () => {
    const sdkKey = 'vf_server_test';
    const key = createHash('sha256').update(sdkKey).digest('hex');
    await write({ [key]: definitions });
    expect(
      await read({
        ...auth,
        resolveBundledDefinitionsLookup: async () => ({
          type: 'sdk-key',
          sdkKey,
        }),
      }),
    ).toEqual({ state: 'ok', definitions });
  });

  it('shares the parsed snapshot between readers', async () => {
    await write({ prj_test: definitions });
    expect(await read()).toEqual({ state: 'ok', definitions });
    await rm(path);
    expect(await read()).toEqual({ state: 'ok', definitions });
  });

  it('uses the generated package when no snapshot exists', async () => {
    legacy.get.mockReturnValue(definitions);
    expect(await read()).toEqual({ state: 'ok', definitions });
    expect(legacy.get).toHaveBeenCalledWith('prj_test');
  });

  it('does not substitute an older package for a missing snapshot entry', async () => {
    legacy.get.mockReturnValue(definitions);
    await write({ prj_other: definitions });
    expect(await read()).toEqual({ state: 'missing-entry', definitions: null });
    expect(legacy.get).not.toHaveBeenCalled();
  });

  it('does not read inherited properties as definitions', async () => {
    await write({});
    expect(
      await read({
        ...auth,
        resolveBundledDefinitionsLookup: async () => ({
          type: 'project-id',
          projectId: 'toString',
        }),
      }),
    ).toEqual({ state: 'missing-entry', definitions: null });
  });

  it.each([
    'invalid json',
    '{"version":2,"entries":{}}',
    '{"version":1,"entries":[]}',
  ])('reports invalid snapshots: %s', async (contents) => {
    await writeFile(path, contents);
    expect(await read()).toEqual({
      state: 'unexpected-error',
      definitions: null,
      error: expect.any(Error),
    });
    expect(legacy.get).not.toHaveBeenCalled();
  });
});
