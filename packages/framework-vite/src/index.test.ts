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
    });
    const config = await configOf(plugin)(
      { root: '/app' },
      { command: 'build' },
    );

    expect(config?.ssr?.noExternal).toEqual(['flags', '@flags-sdk/example']);
  });

  it('changes nothing without a binding and without code generation', async () => {
    const plugin = flags();

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

    const plugin = flags({ codeGeneration: true });
    const config = await configOf(plugin)({ root: dir }, { command: 'build' });

    expect(config?.resolve?.alias).toEqual([
      { find: 'flags:self', replacement: join(dir, '.flags/self.ts') },
    ]);
    expect(readFileSync(join(dir, '.flags/self.ts'), 'utf8')).toContain(
      'key: "enableSale"',
    );
  });
});
