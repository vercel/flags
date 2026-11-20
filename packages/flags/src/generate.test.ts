import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runCommand } from './commands';
import { generateFlags, watchFlags } from './generate';

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function app(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'flags-generate-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function addSource(directory: string, name: string): Promise<string> {
  const source = path.join(directory, 'flags/sources', name);
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(source, 'catalog.ts'),
    `export default async function loadCatalog() {
      return {
        flags: { enabled: { variants: [false, true], description: 'A demo flag' } },
      };
    }`,
  );
  // The generation must never run these files
  for (const file of ['provider.ts', 'context.ts']) {
    await writeFile(
      path.join(source, file),
      `throw new Error('${file} must only run in the application');`,
    );
  }
  return source;
}

const read = (directory: string, file: string) =>
  readFile(path.join(directory, '.flags', file), 'utf8');

describe('generateFlags', () => {
  it('generates a source without context.ts', async () => {
    const directory = await app();
    const source = await addSource(directory, 'site');
    await rm(path.join(source, 'context.ts'));

    await generateFlags(directory);

    const site = await read(directory, 'site.ts');
    expect(site).not.toContain('context.ts');
    expect(
      await readFile(path.join(directory, 'flags/generated.d.ts'), 'utf8'),
    ).toContain('type Input = undefined;');
  });

  it('loads a catalog with relative imports without an extension', async () => {
    const directory = await app();
    const source = await addSource(directory, 'site');
    await mkdir(path.join(source, 'lib'));
    await writeFile(
      path.join(source, 'lib/index.ts'),
      "export { flags } from '../definitions';",
    );
    await writeFile(
      path.join(source, 'definitions.ts'),
      "export const flags = { fromImport: { variants: ['a', 'b'] } };",
    );
    await writeFile(
      path.join(source, 'catalog.ts'),
      "import { flags } from './lib';\nexport default () => ({ flags });",
    );

    await generateFlags(directory);

    expect(await read(directory, 'site.ts')).toContain('key: "fromImport"');
  });

  it('writes one module for each source, from its catalog only', async () => {
    const directory = await app();
    await addSource(directory, 'site');
    await addSource(directory, 'billing');

    const aliases = await generateFlags(directory);

    expect(aliases).toEqual({
      'flags:billing': './.flags/billing.ts',
      'flags:site': './.flags/site.ts',
    });
    expect(JSON.parse(await read(directory, 'aliases.json'))).toEqual(aliases);
    // Git ignores the folder without a setup step
    expect(await read(directory, '.gitignore')).toBe('*\n');
    const site = await read(directory, 'site.ts');
    expect(site).toContain("'use flags';");
    expect(site).toContain('key: "enabled"');
    expect(site).toContain('A demo flag');
  });

  it('writes nothing for an application without sources', async () => {
    await expect(generateFlags(await app())).resolves.toEqual({});
  });

  it('removes the module of a removed source', async () => {
    const directory = await app();
    await addSource(directory, 'site');
    const billing = await addSource(directory, 'billing');
    await generateFlags(directory);
    await rm(billing, { recursive: true });
    await generateFlags(directory);

    await expect(
      stat(path.join(directory, '.flags/billing.ts')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await read(directory, 'aliases.json'))).toEqual({
      'flags:site': './.flags/site.ts',
    });
  });

  it('checks the files of the sources before it runs a catalog', async () => {
    const directory = await app();
    const source = await addSource(directory, 'site');
    await rm(path.join(source, 'provider.ts'));
    await writeFile(
      path.join(source, 'catalog.ts'),
      "throw new Error('The catalog must not run');",
    );

    await expect(generateFlags(directory)).rejects.toThrow(
      'flags: The source "site" needs flags/sources/site/provider.ts.',
    );
  });

  it('keeps the modules when a catalog fails', async () => {
    const directory = await app();
    const source = await addSource(directory, 'site');
    await writeFile(
      path.join(source, 'catalog.ts'),
      "export default async function loadCatalog() { throw new Error('No catalog'); }",
    );
    await mkdir(path.join(directory, '.flags'));
    await writeFile(path.join(directory, '.flags/site.ts'), 'the last module');

    await expect(generateFlags(directory)).rejects.toThrow('No catalog');
    expect(await read(directory, 'site.ts')).toBe('the last module');
  });

  it('rejects a catalog without flags or variants', async () => {
    const directory = await app();
    const source = await addSource(directory, 'site');
    await writeFile(
      path.join(source, 'catalog.ts'),
      'export default () => ({ flags: { a: {} } });',
    );

    await expect(generateFlags(directory)).rejects.toThrow(
      'flags: Flag "a" of the source "site" has no variants.',
    );
  });
});

async function addStreamingSource(directory: string, name: string) {
  const source = await addSource(directory, name);
  const file = path.join(source, 'catalog.ts');
  await writeFile(
    file,
    `
    export const state = { closed: false, delivered: 0 };
    const pending = [];
    let wake;
    export function publish(catalog) {
      pending.push(catalog);
      wake?.();
    }
    export default async function* loadCatalog({ signal }) {
      const abort = () => wake?.();
      signal.addEventListener('abort', abort);
      try {
        yield { revision: 1, flags: { enabled: { variants: [true, false] } } };
        while (!signal.aborted) {
          if (!pending.length) {
            await new Promise((resolve) => { wake = resolve; });
          }
          if (signal.aborted) { break; }
          const catalog = pending.shift();
          if (catalog instanceof Error) { throw catalog; }
          yield catalog;
          state.delivered += 1;
        }
      } finally {
        state.closed = true;
        signal.removeEventListener('abort', abort);
      }
    }
  `,
  );
  return (await import(pathToFileURL(file).href)) as {
    state: { closed: boolean; delivered: number };
    publish(catalog: unknown): void;
  };
}

async function waitFor(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error('Timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('watchFlags', () => {
  it('takes the first catalog of a stream for sync, and closes it', async () => {
    const directory = await app();
    const site = await addStreamingSource(directory, 'site');

    await generateFlags(directory);

    expect(site.state.closed).toBe(true);
    expect(await read(directory, 'site.ts')).toContain('key: "enabled"');
  });

  it('writes the modules again after each change of a catalog', async () => {
    const directory = await app();
    const site = await addStreamingSource(directory, 'site');
    const billing = await addStreamingSource(directory, 'billing');
    const controller = new AbortController();
    const { done } = await watchFlags(directory, {
      signal: controller.signal,
    });

    const offer = {
      revision: 2,
      flags: {
        offer: { variants: ['small', 'large'], description: 'The offer' },
      },
    };
    site.publish(offer);
    billing.publish({ revision: 2, flags: { price: { variants: [10, 20] } } });
    await waitFor(
      () => site.state.delivered === 1 && billing.state.delivered === 1,
    );
    const module = await read(directory, 'site.ts');
    expect(module).not.toContain('key: "enabled"');
    expect(module).toContain('options: ["small","large"] as const');
    expect(await read(directory, 'billing.ts')).toContain('key: "price"');
    expect(JSON.parse(await read(directory, 'catalog.json'))).toEqual({
      billing: { revision: 2, flags: 1 },
      site: { revision: 2, flags: 1 },
    });

    // The same catalog again does not touch the module
    const file = path.join(directory, '.flags/site.ts');
    const before = (await stat(file)).mtimeMs;
    site.publish({ ...offer, revision: 3 });
    await waitFor(() => site.state.delivered === 2);
    expect((await stat(file)).mtimeMs).toBe(before);

    controller.abort();
    await done;
    expect(site.state.closed).toBe(true);
    expect(billing.state.closed).toBe(true);
  });

  it('keeps the modules and closes all catalogs when one fails', async () => {
    const directory = await app();
    const site = await addStreamingSource(directory, 'site');
    const billing = await addStreamingSource(directory, 'billing');
    const controller = new AbortController();
    cleanups.push(async () => controller.abort());
    const { done } = await watchFlags(directory, {
      signal: controller.signal,
    });
    const before = await read(directory, 'site.ts');

    site.publish(new Error('The subscription failed'));

    await expect(done).rejects.toThrow('The subscription failed');
    expect(await read(directory, 'site.ts')).toBe(before);
    expect(site.state.closed).toBe(true);
    expect(billing.state.closed).toBe(true);
  });

  it('needs a first catalog', async () => {
    const directory = await app();
    const source = await addSource(directory, 'site');
    await writeFile(
      path.join(source, 'catalog.ts'),
      'export default async function* () {}',
    );

    await expect(generateFlags(directory)).rejects.toThrow(
      'flags: The catalog of the source "site" gave no catalog.',
    );
  });
});

describe('flags sync', () => {
  it('loads the .env files for the catalogs, and writes the modules', async () => {
    const directory = await app();
    const source = await addSource(directory, 'site');
    await writeFile(path.join(directory, '.env'), 'CATALOG_FLAG=from-env\n');
    await writeFile(
      path.join(source, 'catalog.ts'),
      `export default () => ({
        flags: { [process.env.CATALOG_FLAG]: { variants: [true] } },
      });`,
    );
    cleanups.push(async () => {
      delete process.env.CATALOG_FLAG;
    });

    await expect(runCommand(['sync', directory])).resolves.toBe(
      'flags: Wrote the modules of flags:site.',
    );
    expect(await read(directory, 'site.ts')).toContain('key: "from-env"');
  });
});
