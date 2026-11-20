import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Catalog } from './catalog';
import { renderDeclarations, renderSourceModule } from './codegen';
import { hasUseFlagsDirective } from './directive';

const catalog: Catalog = {
  project: { system: 'launchdarkly', projectId: 'shop', teamId: 'acme' },
  flags: {
    'summer-sale': { variants: [false, true], description: 'The sale' },
    checkout: { variants: ['control', 'express'], defaultValue: 'control' },
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
    expect(code).toContain('  defaultValue: "control",');
    expect(code).toContain('/**\n * The sale\n */');
    // The keys are sorted, so the file is stable
    expect(code.indexOf('"checkout"')).toBeLessThan(
      code.indexOf('"summer-sale"'),
    );
    expect(code).not.toContain('catalog');
  });

  it('writes no project without a project in the catalog', () => {
    expect(renderSourceModule('site', { flags: {} })).not.toContain('project:');
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
        request: FlagsRequest | undefined,
        input: { teamId: string },
      ) {
        return { teamId: input.teamId, user: request?.cookies?.get('user')?.value ?? null };
      }`,
    );
    await writeFile(
      path.join(directory, '.flags/site.ts'),
      renderSourceModule('site', catalog),
    );
    // A source whose context has only the request, the usual case
    const self = path.join(directory, 'flags/sources/self');
    await mkdir(self, { recursive: true });
    await writeFile(
      path.join(self, 'provider.ts'),
      `import { TypedInMemoryProvider } from '@openfeature/server-sdk';
      export default new TypedInMemoryProvider({});`,
    );
    await writeFile(
      path.join(self, 'context.ts'),
      `import type { FlagsRequest } from 'flags';
      export default function getEvaluationContext(request: FlagsRequest | undefined) {
        return { user: request?.cookies?.get('user')?.value ?? null };
      }`,
    );
    await writeFile(
      path.join(directory, 'flags/generated.d.ts'),
      renderDeclarations([
        ['site', catalog],
        ['self', { flags: { enableSale: { variants: [false, true] } } }],
      ]),
    );
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const root = path.resolve(__dirname, '..');
  const consumer = () => path.join(directory, 'consumer.ts');

  // A usual configuration: no paths for flags:<source>, and no
  // allowImportingTsExtensions. The program includes the folder flags.
  function compilerOptions(): ts.CompilerOptions {
    const config = ts.readConfigFile(
      path.join(root, 'tsconfig.json'),
      ts.sys.readFile,
    );
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    return {
      ...parsed.options,
      noEmit: true,
      incremental: false,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      baseUrl: root,
      paths: {
        ...parsed.options.paths,
        flags: [path.join(root, 'src/index.ts')],
        '@openfeature/server-sdk': [
          path.join(root, 'node_modules/@openfeature/server-sdk'),
        ],
      },
    };
  }

  function check(code: string, options = compilerOptions()): string[] {
    const file = consumer();
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile;
    host.getSourceFile = (name, version) =>
      name === file
        ? ts.createSourceFile(name, code, version)
        : getSourceFile(name, version);
    const program = ts.createProgram(
      [file, path.join(directory, 'flags/generated.d.ts')],
      options,
      host,
    );
    return ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
  }

  it('gives each flag its type and its context, without tsconfig paths', () => {
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

  it('needs no context for a source whose context has only the request', () => {
    expect(
      check(`
        import { enableSale } from 'flags:self';
        const sale: Promise<boolean> = enableSale();
        void sale;
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

  it('shows a short type in the editor, with the name of the source', () => {
    const file = consumer();
    const code = `import { checkout } from 'flags:site';\ncheckout;\n`;
    const options = compilerOptions();
    const files = [file, path.join(directory, 'flags/generated.d.ts')];
    const service = ts.createLanguageService({
      getScriptFileNames: () => files,
      getScriptVersion: () => '1',
      getScriptSnapshot: (name) => {
        if (name === file) {
          return ts.ScriptSnapshot.fromString(code);
        }
        const text = ts.sys.readFile(name);
        return text === undefined
          ? undefined
          : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => directory,
      getCompilationSettings: () => options,
      getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
    });
    const info = service.getQuickInfoAtPosition(
      file,
      code.indexOf('checkout;'),
    );
    const shown = ts.displayPartsToString(info?.displayParts);

    expect(shown).toContain('Flag<SiteSource, "checkout"');
    expect(shown.length).toBeLessThan(200);
  });

  it('writes a module which compiles', () => {
    expect(
      check(`import { checkout } from './.flags/site.ts';\nvoid checkout;`, {
        ...compilerOptions(),
        allowImportingTsExtensions: true,
      }),
    ).toEqual([]);
  });
});
