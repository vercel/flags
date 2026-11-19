import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Catalog } from './catalog';
import { renderSourceModule } from './codegen';
import { hasUseFlagsDirective } from './directive';

const catalog: Catalog = {
  project: { system: 'launchdarkly', projectId: 'shop', teamId: 'acme' },
  flags: {
    'summer-sale': { variants: [false, true], description: 'The sale' },
    checkout: { variants: ['control', 'express'] },
    'max-items': { variants: [10, 20] },
    theme: { variants: [{ color: 'blue' }, { color: 'red' }] },
    mixed: { variants: [{ mode: 'dark' }, null, 'off'] },
    // A key which is not a valid name of a variable
    'with"quote': { variants: [true] },
  },
};

describe('renderSourceModule', () => {
  it('writes a use flags module with defineSource and bindFlag', () => {
    const code = renderSourceModule('site', catalog);

    expect(hasUseFlagsDirective(code)).toBe(true);
    expect(code).toContain(
      "import provider from '../flags/sources/site/provider.ts';",
    );
    expect(code).toContain(
      "import getEvaluationContext from '../flags/sources/site/context.ts';",
    );
    expect(code).toContain(
      'project: {"system":"launchdarkly","projectId":"shop","teamId":"acme"},',
    );
    expect(code).toContain('export { flag_0 as "checkout" };');
    expect(code).toContain('/**\n * The sale\n */');
    // The keys are sorted, so the file is stable
    expect(code.indexOf('"checkout"')).toBeLessThan(
      code.indexOf('"summer-sale"'),
    );
    expect(code).not.toContain('catalog');
  });

  it('uses an in-memory project without a project in the catalog', () => {
    expect(renderSourceModule('site', { flags: {} })).toContain(
      'project: {"system":"in-memory"},',
    );
  });

  it('gives a flag with variants of mixed types the type object', () => {
    const code = renderSourceModule('site', {
      flags: {
        mixed: { variants: [{ a: 1 }, null, 'text', 1, [1]] },
        empty: { variants: [] },
      },
    });

    expect(code).toContain(
      'type: "object",\n  options: [{"value":{"a":1}},{"value":null},{"value":"text"},{"value":1},{"value":[1]}],',
    );
    expect(code).toContain('key: "empty",\n  source,\n  type: "object",');
  });

  it('rejects a name which can not be a directory', () => {
    expect(() => renderSourceModule('../outside', { flags: {} })).toThrow(
      'flags: Invalid name of a source',
    );
  });
});

describe('the types of a generated module', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'flags-codegen-'));
    const source = path.join(directory, 'flags/sources/site');
    await mkdir(source, { recursive: true });
    await mkdir(path.join(directory, '.flags'));
    await writeFile(
      path.join(source, 'provider.ts'),
      `import { TypedInMemoryProvider } from '@openfeature/server-sdk';
      export default new TypedInMemoryProvider({});`,
    );
    await writeFile(
      path.join(source, 'context.ts'),
      `import type { FlagsRequest } from 'flags';
      export default function getEvaluationContext(
        input: { teamId: string },
        request: FlagsRequest | undefined,
      ) {
        return { teamId: input.teamId, user: request?.cookies?.get('user')?.value ?? null };
      }`,
    );
    await writeFile(
      path.join(directory, '.flags/site.ts'),
      renderSourceModule('site', catalog),
    );
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function check(code: string): string[] {
    const file = path.join(directory, 'consumer.ts');
    const root = path.resolve(__dirname, '..');
    const config = ts.readConfigFile(
      path.join(root, 'tsconfig.json'),
      ts.sys.readFile,
    );
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const options: ts.CompilerOptions = {
      ...parsed.options,
      noEmit: true,
      incremental: false,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      allowImportingTsExtensions: true,
      baseUrl: root,
      paths: {
        ...parsed.options.paths,
        flags: [path.join(root, 'src/index.ts')],
        'flags:*': [path.join(directory, '.flags/*')],
        '@openfeature/server-sdk': [
          path.join(root, 'node_modules/@openfeature/server-sdk'),
        ],
      },
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile;
    host.getSourceFile = (name, version) =>
      name === file
        ? ts.createSourceFile(name, code, version)
        : getSourceFile(name, version);
    const program = ts.createProgram([file], options, host);
    return ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
  }

  it('gives each flag its type and its context', () => {
    expect(
      check(`
        import { checkout, 'max-items' as maxItems, mixed, 'summer-sale' as summerSale, theme } from 'flags:site';
        const ctx = { evaluationContext: { teamId: 'acme' } };
        const sale: Promise<boolean> = summerSale(ctx);
        const flow: Promise<'control' | 'express' | (string & {})> = checkout(ctx);
        const items: Promise<number> = maxItems(ctx);
        void theme(ctx);
        const json: Promise<import('flags').FlagObjectValue> = mixed(ctx);
        void json;
        void [sale, flow, items];
      `),
    ).toEqual([]);
  });

  it('rejects an unknown flag and a missing context', () => {
    const errors = check(`
      import { missing, checkout } from 'flags:site';
      void checkout();
    `);

    expect(errors.some((e) => e.includes('no exported member'))).toBe(true);
    expect(errors.some((e) => e.includes('Expected 1 arguments'))).toBe(true);
  });
});
