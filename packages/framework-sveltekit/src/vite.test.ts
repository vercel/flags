import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { flags } from './vite';

type Hook = (this: unknown, ...args: unknown[]) => unknown;

function hook(plugin: ReturnType<typeof flags>, name: string): Hook {
  const value = (plugin as unknown as Record<string, unknown>)[name];
  return (
    typeof value === 'function' ? value : (value as { handler: Hook }).handler
  ) as Hook;
}

function project(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'flags-sveltekit-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  return dir;
}

describe('flags()', () => {
  it('points flags/framework to the binding of SvelteKit, and bundles the SDK', () => {
    const plugin = flags();
    const config = hook(plugin, 'config')();

    expect(config).toEqual({
      resolve: {
        alias: [
          {
            find: /^flags\/framework$/,
            // The absolute path of the binding next to the plugin
            replacement: expect.stringMatching(/[\\/]binding\.js$/),
          },
        ],
      },
      // The alias only applies to bundled code
      ssr: { noExternal: ['flags', '@flags-sdk/sveltekit'] },
      optimizeDeps: { exclude: ['flags', '@flags-sdk/sveltekit'] },
    });
  });

  it('removes the directive, and keeps the positions in the module', () => {
    const transform = hook(flags(), 'transform');
    const code = "'use flags';\nexport const a = 1;";

    const result = transform(code, '/app/src/lib/flags.ts') as {
      code: string;
    };

    expect(result.code).toBe('           ;\nexport const a = 1;');
    expect(transform(code, '/app/node_modules/x/flags.js')).toBeNull();
    expect(transform('export const a = 1;', '/app/a.ts')).toBeNull();
  });

  it('emits a chunk for each flags module in the server build', () => {
    const root = project({
      'src/lib/flags.ts': "'use flags';\nexport {};",
      'src/routes/+page.ts': 'export {};',
    });
    const plugin = flags();
    hook(plugin, 'configResolved')({ root, command: 'build' });
    const emitFile = vi.fn(() => 'reference');

    hook(plugin, 'buildStart').call({
      emitFile,
      environment: { config: { consumer: 'server' } },
    });
    hook(plugin, 'buildStart').call({
      emitFile,
      environment: { config: { consumer: 'client' } },
    });

    expect(emitFile).toHaveBeenCalledTimes(1);
    expect(emitFile).toHaveBeenCalledWith({
      type: 'chunk',
      id: join(root, 'src/lib/flags.ts'),
      name: expect.stringMatching(/^flags-[0-9a-f]{8}$/),
      preserveSignature: 'strict',
    });
  });

  it('serves the manifest in the dev server', async () => {
    const root = project({ 'src/lib/flags.ts': "'use flags';\nexport {};" });
    const plugin = flags();
    hook(plugin, 'configResolved')({ root, command: 'serve' });
    let middleware: Hook = () => undefined;
    const server = {
      middlewares: { use: (fn: Hook) => (middleware = fn) },
      environments: {
        ssr: {
          runner: {
            import: async () => ({
              banner: { key: 'banner', defaultValue: 'Welcome' },
            }),
          },
        },
      },
    } as unknown as ViteDevServer;
    hook(plugin, 'configureServer')(server);
    const headers: Record<string, string> = {};
    let body = '';
    const next = vi.fn();

    await middleware(
      { url: '/.well-known/flags/manifest.json?x=1' },
      {
        setHeader: (name: string, value: string) => (headers[name] = value),
        end: (text: string) => (body = text),
      },
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(headers['cache-control']).toBe('no-store');
    expect(JSON.parse(body).definitions).toEqual({
      banner: {
        type: 'string',
        defaultValue: 'Welcome',
        declaredInCode: true,
        declarations: [{ module: 'src/lib/flags.ts', export: 'banner' }],
      },
    });

    await middleware({ url: '/' }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});
