import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flags } from './index';

type ConfigHook = (
  config: { root?: string },
  env: { command: 'build' | 'serve' },
) => Promise<
  | {
      ssr?: { noExternal?: string[] };
      resolve?: { alias?: { find: string | RegExp; replacement: string }[] };
    }
  | undefined
>;
const configOf = (plugin: ReturnType<typeof flags>) =>
  plugin.config as unknown as ConfigHook;

describe('flags', () => {
  it('bundles the SDK and the package of the binding', async () => {
    const plugin = flags({
      binding: '@flags-sdk/example/binding',
      bundle: ['@flags-sdk/example'],
      disableCodeGeneration: true,
    });
    const config = await configOf(plugin)(
      { root: '/app' },
      { command: 'build' },
    );

    expect(config?.ssr?.noExternal).toEqual(['flags', '@flags-sdk/example']);
  });

  it('changes nothing without a binding and without code generation', async () => {
    const plugin = flags({ disableCodeGeneration: true });

    expect(
      await configOf(plugin)({ root: '/app' }, { command: 'build' }),
    ).toBeUndefined();
  });
});

describe('code generation of flags:<source>', () => {
  it('generates the modules for a build, and adds the aliases', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flags-vite-'));
    const source = join(dir, 'flags/sources/self');
    mkdirSync(source, { recursive: true });
    writeFileSync(
      join(source, 'catalog.ts'),
      'export default () => ({ flags: { enableSale: { variants: [false, true] } } });',
    );
    // The generation must not run them
    writeFileSync(join(source, 'provider.ts'), "throw new Error('no');");
    writeFileSync(join(source, 'context.ts'), "throw new Error('no');");

    const plugin = flags();
    const config = await configOf(plugin)({ root: dir }, { command: 'build' });

    expect(config?.resolve?.alias).toEqual([
      { find: 'flags:self', replacement: join(dir, '.flags/self.ts') },
    ]);
    expect(readFileSync(join(dir, '.flags/self.ts'), 'utf8')).toContain(
      'key: "enableSale"',
    );
    expect(readFileSync(join(dir, 'flags/generated.d.ts'), 'utf8')).toContain(
      "declare module 'flags:self'",
    );
  });
});

describe('code generation by default', () => {
  it('finds flags/sources in src, and writes nothing without sources', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'flags-vite-'));
    expect(await configOf(flags())({ root: empty }, { command: 'build' })).toBe(
      undefined,
    );

    const dir = mkdtempSync(join(tmpdir(), 'flags-vite-'));
    const source = join(dir, 'src/flags/sources/self');
    mkdirSync(source, { recursive: true });
    writeFileSync(
      join(source, 'catalog.ts'),
      'export default () => ({ flags: { enableSale: { variants: [false, true] } } });',
    );
    writeFileSync(join(source, 'provider.ts'), "throw new Error('no');");
    writeFileSync(join(source, 'context.ts'), "throw new Error('no');");

    await configOf(flags())({ root: dir }, { command: 'build' });

    expect(readFileSync(join(dir, '.flags/self.ts'), 'utf8')).toContain(
      "from '../src/flags/sources/self/provider.ts'",
    );
    expect(
      readFileSync(join(dir, 'src/flags/generated.d.ts'), 'utf8'),
    ).toContain("declare module 'flags:self'");
  });
});
