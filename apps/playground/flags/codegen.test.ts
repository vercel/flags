import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { renderModule } from './codegen.ts';
import { catalogFromDatafile } from './vercel.ts';

test('generated imports have exact keys and variant types without declarations', async () => {
  const app = path.resolve(import.meta.dirname, '..');
  const directory = await mkdtemp(path.join(app, '.flags-test-'));
  try {
    const catalog = catalogFromDatafile({
      projectId: 'test',
      environment: 'development',
      definitions: {
        flag0: {
          seed: 0,
          variants: [true, false],
          environments: { development: 0 },
        },
        'with-dashes': {
          seed: 0,
          variants: ['control', 'treatment'],
          environments: { development: 0 },
        },
        default: {
          seed: 0,
          variants: [null, { mode: 'dark', sizes: [1, 2] }],
          environments: { development: 0 },
        },
        'with"quote': {
          seed: 0,
          variants: [1],
          environments: { development: 0 },
        },
      },
    });
    await writeFile(
      path.join(directory, 'site.ts'),
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
    const program = ts.createProgram([consumer], {
      ...parsed.options,
      incremental: false,
      paths: { 'flags:site': [path.join(directory, 'site.ts')] },
    });
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
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('connection names cannot escape the generated module directory', () => {
  assert.throws(
    () => renderModule('../outside', { id: 'test', flags: {} }),
    /Invalid connection/,
  );
});
