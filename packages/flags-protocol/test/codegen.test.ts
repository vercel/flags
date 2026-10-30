import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { renderModule } from '../src/codegen.ts';
import type { Catalog } from '../src/connection.ts';

test('generated imports check keys, variants, and the provider context contract', async () => {
  const app = path.resolve(import.meta.dirname, '..');
  const directory = await mkdtemp(path.join(app, '.flags-test-'));
  try {
    const output = path.join(directory, '.flags');
    const source = path.join(directory, 'flags/sources/site');
    await mkdir(output);
    await mkdir(source, { recursive: true });
    await mkdir(path.join(directory, 'node_modules'));
    await symlink(app, path.join(directory, 'node_modules/flags'), 'dir');
    await writeFile(
      path.join(source, 'provider.ts'),
      `import type { Provider } from 'flags';
      const provider: Provider<{ user: { id: string } }> = {
        async evaluate(_key, context) {
          return { value: context.user.id, catalogId: 'test/development' };
        },
      };
      export default provider;`,
    );
    await writeFile(
      path.join(source, 'context.ts'),
      "export default async function getEvaluationContext() { return { user: { id: 'alice' } }; }",
    );
    const catalog: Catalog = {
      id: 'test/development',
      flags: {
        flag0: { variants: [true, false] },
        'with-dashes': {
          variants: ['control', 'treatment'],
        },
        default: {
          variants: [null, { mode: 'dark', sizes: [1, 2] }],
        },
        'with"quote': { variants: [1] },
      },
    };
    await writeFile(
      path.join(output, 'site.ts'),
      renderModule('site', catalog),
    );
    const consumer = path.join(directory, 'consumer.ts');
    await writeFile(
      consumer,
      `
      import { flag0, 'with-dashes' as experiment, default as settings, 'with"quote' as quote } from 'flags:site';
      const boolean: Promise<boolean> = flag0();
      const variant: Promise<'control' | 'treatment'> = experiment();
      const json: Promise<null | { readonly mode: 'dark'; readonly sizes: readonly [1, 2] }> = settings();
      const number: Promise<1> = quote();
      // @ts-expect-error Unknown keys must fail without a linter.
      import { missing } from 'flags:site';
      // @ts-expect-error Unknown connections must fail too.
      import { flag0 as missingConnection } from 'flags:unknown';
      // @ts-expect-error The return value is not a string.
      const wrong: Promise<string> = flag0();
      // @ts-expect-error Variant types cannot become any or string.
      const tooNarrow: Promise<'control'> = experiment();
    `,
    );
    const config = ts.readConfigFile(
      path.join(app, 'tsconfig.json'),
      ts.sys.readFile,
    );
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, app);
    const options = {
      ...parsed.options,
      incremental: false,
      paths: { 'flags:site': [path.join(output, 'site.ts')] },
    };
    const program = ts.createProgram([consumer], options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => app,
        getNewLine: () => '\n',
      }),
    );

    await writeFile(
      path.join(source, 'context.ts'),
      'export default async function getEvaluationContext() { return { user: { id: 123 } }; }',
    );
    const invalid = ts.getPreEmitDiagnostics(
      ts.createProgram([consumer], options),
    );
    assert.ok(
      invalid.some(
        (diagnostic) =>
          diagnostic.code === 2322 &&
          diagnostic.file?.fileName === path.join(output, 'site.ts'),
      ),
      'The generated connection must reject a context that the provider cannot accept.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('source names cannot escape the generated module directory', () => {
  assert.throws(
    () => renderModule('../outside', { id: 'test', flags: {} }),
    /Invalid flags source/,
  );
});
