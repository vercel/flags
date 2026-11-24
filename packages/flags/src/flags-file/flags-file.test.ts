import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasUseFlagsDirective } from '../directive';
import {
  compileFlagsFile,
  FlagsFileError,
  formatDiagnostics,
  renderFlagsFileTypes,
} from './compile';
import {
  declarationFileOf,
  writeFlagsFileDeclaration,
  writeFlagsFileDeclarations,
} from './declarations';
import { flagOptionsOf, parseFlagsFile } from './document';
import { parseFlagsSyntax, toJsonValue } from './syntax';

describe('parseFlagsSyntax', () => {
  it('reads source, the flags and the plain values of their bodies', () => {
    const statements = parseFlagsSyntax(`// A comment
/* A comment
   on more lines */
source "shop"

flag newFeature

flag summerSale {
  key: "summer-sale",
  title: "a \\"b\\" \\u00e9",
  'single': 'it\\'s',
  number: -6.5e-1,
  hex: 0xff,
  yes: true,
  nothing: null,
  list: [
    1, // one
    2,
  ],
  "object": { a: 1, "b c": [true] },
}

flag $special_1 {}
`);
    expect(
      statements.map((statement) =>
        statement.kind === 'source'
          ? ['source', statement.name]
          : [
              'flag',
              statement.name,
              statement.body ? toJsonValue(statement.body) : undefined,
            ],
      ),
    ).toEqual([
      ['source', 'shop'],
      ['flag', 'newFeature', undefined],
      [
        'flag',
        'summerSale',
        {
          key: 'summer-sale',
          title: 'a "b" é',
          single: "it's",
          number: -0.65,
          hex: 255,
          yes: true,
          nothing: null,
          list: [1, 2],
          object: { a: 1, 'b c': [true] },
        },
      ],
      ['flag', '$special_1', {}],
    ]);
  });

  it('takes a new line instead of a comma, and a source without quotes', () => {
    const statements = parseFlagsSyntax(`source my-source

flag checkout {
  description: "The checkout flow"
  options: [
    "control"
    { value: "express", label: "Express" }
  ]
  defaultValue: "control", // a comma still works
}
`);
    expect(
      statements.map((statement) =>
        statement.kind === 'source'
          ? ['source', statement.name]
          : [
              'flag',
              statement.name,
              statement.body && toJsonValue(statement.body),
            ],
      ),
    ).toEqual([
      ['source', 'my-source'],
      [
        'flag',
        'checkout',
        {
          description: 'The checkout flow',
          options: ['control', { value: 'express', label: 'Express' }],
          defaultValue: 'control',
        },
      ],
    ]);
  });

  it('needs a comma between two entries on one line', () => {
    expect(() =>
      parseFlagsSyntax('flag a { type: "string" defaultValue: "x" }'),
    ).toThrow('Expected ",", a new line or "}" in the object.');
    expect(() => parseFlagsSyntax('flag a { options: [1 2] }')).toThrow(
      'Expected ",", a new line or "]" in the array.',
    );
  });

  it.each([
    [
      'flag summer-sale {}',
      'The name of a flag is the JavaScript name which you import. For the key "summer-sale", write: flag summerSale { key: "summer-sale" }.',
    ],
    [
      'flag "summer-sale" {}',
      'The name of a flag is the JavaScript name which you import. For the key "summer-sale", write: flag summerSale { key: "summer-sale" }.',
    ],
    [
      'flag checkout.v2 {}',
      'For the key "checkout.v2", write: flag checkoutV2 { key: "checkout.v2" }.',
    ],
    ['# comment', 'A comment starts with // or /*, as in JavaScript.'],
    ['resource "aws_instance" "web" {}', 'Unknown statement "resource".'],
    [
      'flag a { description = "x" }',
      'Use ":" after the key "description", as in JavaScript.',
    ],
    ['flag a { defaultValue: x }', 'Put text in quotes: "x".'],
    ['flag a { defaultValue: `x` }', 'not a template literal.'],
    [
      'flag a { defaultValue: 1 + 2 }',
      'Expected ",", a new line or "}" in the object.',
    ],
    ['flag a { defaultValue: NaN }', 'NaN has no JSON value'],
    [
      'flag a { defaultValue: undefined }',
      'Leave the field out instead of undefined.',
    ],
    ['flag a { [key]: 1 }', 'Computed keys are not allowed.'],
    ['flag a { description: "open }', 'The string has no closing quote.'],
    ['flag a { defaultValue: 9007199254740993 }', 'The integer is too large'],
    ['source my.source', 'A name with "." needs quotes: source "my.source".'],
    ['source my- ', 'A name can not end with "-".'],
  ])('rejects %j', (text, message) => {
    expect(() => parseFlagsSyntax(text)).toThrow(message);
  });
});

describe('parseFlagsFile', () => {
  it('reads the flags, their keys, sources, types and fields', () => {
    const document = parseFlagsFile(`source shop

flag summerSale {
  key: "summer-sale"
  description: "Shows the summer sale banner"
  defaultValue: false
}

flag checkout {
  options: ["control", { value: "express", label: "Express" }]
  defaultValue: "control"
}

flag maxItems {
  options: [10, 20]
}

flag theme {
  defaultValue: { color: "blue" }
  options: [{ value: { color: "blue" } }, { value: { color: "red" } }]
}

flag bare

flag heroText {
  key: "hero-text"
  source: "marketing"
  defaultValue: "Welcome"
}

flag notes {
  description: "A long description \\
on two lines."
}
`);
    expect(document.diagnostics).toEqual([]);
    expect(document.source).toBe('shop');
    expect(
      document.flags.map((flag) => [flag.name, flagOptionsOf(flag)]),
    ).toEqual([
      [
        'summerSale',
        {
          key: 'summer-sale',
          source: 'shop',
          type: 'boolean',
          description: 'Shows the summer sale banner',
          defaultValue: false,
        },
      ],
      [
        'checkout',
        {
          key: 'checkout',
          source: 'shop',
          type: 'string',
          options: [
            { value: 'control' },
            { value: 'express', label: 'Express' },
          ],
          defaultValue: 'control',
        },
      ],
      [
        'maxItems',
        {
          key: 'maxItems',
          source: 'shop',
          type: 'number',
          options: [{ value: 10 }, { value: 20 }],
        },
      ],
      [
        'theme',
        {
          key: 'theme',
          source: 'shop',
          type: 'object',
          options: [{ value: { color: 'blue' } }, { value: { color: 'red' } }],
          defaultValue: { color: 'blue' },
        },
      ],
      ['bare', { key: 'bare', source: 'shop', type: 'boolean' }],
      [
        'heroText',
        {
          key: 'hero-text',
          source: 'marketing',
          type: 'string',
          defaultValue: 'Welcome',
        },
      ],
      [
        'notes',
        {
          key: 'notes',
          source: 'shop',
          type: 'boolean',
          description: 'A long description on two lines.',
        },
      ],
    ]);
  });

  it('uses the source self without "source"', () => {
    expect(parseFlagsFile('flag a\n').flags[0]?.source).toBe('self');
  });

  it('points to each error, and keeps the other flags', () => {
    const text = `flag good {
  defaultValue: true
}

flag typo {
  defualtValue: true
}

flag wrongType {
  type: "string"
  defaultValue: 1
}

flag mixed {
  options: [1, "a"]
}

flag dup {
  options: ["a", "a"]
}

flag good

flag sameKey {
  key: "good"
}

flag emptyKey {
  key: ""
}

flag badSource {
  source: "a.b"
}

flag default

source "late"
`;
    const document = parseFlagsFile(text);
    expect(document.flags.map((flag) => flag.name)).toEqual(['good']);
    expect(
      document.diagnostics.map((diagnostic) => [
        text.slice(diagnostic.start, diagnostic.start + diagnostic.length),
        diagnostic.message,
      ]),
    ).toEqual([
      [
        'defualtValue',
        'Unknown field "defualtValue" in the flag "typo". Did you mean "defaultValue"?',
      ],
      [
        '1',
        'The flag "wrongType" has the type string, so "defaultValue" must be a string.',
      ],
      [
        '[1, "a"]',
        'The options of "mixed" have different types. Set "type", or use options of one type.',
      ],
      ['"a"', 'The option "a" is in "options" two times.'],
      ['good', 'The flag good is declared two times.'],
      [
        '"good"',
        'The flags good and sameKey have the same key "good" in the source "self". Each key can have one flag.',
      ],
      [
        '""',
        '"key" must be the key of the flag in your flag management system, in quotes, e.g. key: "summer-sale".',
      ],
      [
        '"a.b"',
        '"source" must be the name of a source in quotes, e.g. source: "marketing". It starts with a letter, and has only letters, digits, "-" and "_".',
      ],
      [
        'default',
        '"default" is a reserved word of JavaScript, so it can not be the name of a flag. Choose another name, and set the key: flag defaultFlag { key: "default" }.',
      ],
      ['source', 'Put source before the first flag.'],
    ]);
  });

  it('takes one key in two sources', () => {
    const document = parseFlagsFile(
      'flag banner\n\nflag marketingBanner {\n  key: "banner"\n  source: "marketing"\n}\n',
    );
    expect(document.diagnostics).toEqual([]);
    expect(
      document.flags.map((flag) => [flag.name, flag.key, flag.source]),
    ).toEqual([
      ['banner', 'banner', 'self'],
      ['marketingBanner', 'banner', 'marketing'],
    ]);
  });

  it('warns about a default value which is not an option', () => {
    const document = parseFlagsFile(
      'flag checkout {\n  options: ["a", "b"]\n  defaultValue: "c"\n}\n',
    );
    expect(document.flags).toHaveLength(1);
    expect(document.diagnostics).toMatchObject([
      {
        severity: 'warning',
        message: '"defaultValue" is not one of the options of "checkout".',
      },
    ]);
  });

  it('gives a syntax error a position', () => {
    const text = 'flag a {\n  defaultValue: tru,\n}\n';
    const [diagnostic] = parseFlagsFile(text).diagnostics;
    expect(
      formatDiagnostics('app.flags', text, diagnostic ? [diagnostic] : []),
    ).toBe(`app.flags:2:17 - error: A flags file has only plain values: strings, numbers, true, false, null, arrays and objects. Put text in quotes: "tru".

    defaultValue: tru,
                  ~~~`);
  });
});

describe('compileFlagsFile', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'flags-file-'));
    await writeFile(path.join(directory, 'package.json'), '{}');
    const shop = path.join(directory, 'flags/sources/shop');
    await mkdir(shop, { recursive: true });
    await writeFile(
      path.join(shop, 'provider.ts'),
      `import { TypedInMemoryProvider } from '@openfeature/server-sdk';
export default new TypedInMemoryProvider({
  'summer-sale': { variants: { on: true, off: false }, defaultVariant: 'on', disabled: false },
  checkout: { variants: { a: 'express' }, defaultVariant: 'a', disabled: false },
});`,
    );
    await writeFile(
      path.join(shop, 'context.ts'),
      `import type { FlagsRequest } from 'flags';
export default function getEvaluationContext(
  request: FlagsRequest | undefined,
  input: { teamId: string },
) {
  return { targetingKey: input.teamId };
}`,
    );
    // A second source, which one flag uses
    const marketing = path.join(directory, 'flags/sources/marketing');
    await mkdir(marketing, { recursive: true });
    await writeFile(
      path.join(marketing, 'provider.ts'),
      `import { TypedInMemoryProvider } from '@openfeature/server-sdk';
export default new TypedInMemoryProvider({
  'hero-text': { variants: { a: 'Hello again' }, defaultVariant: 'a', disabled: false },
});`,
    );
    await mkdir(path.join(directory, 'app'));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const text = `source shop

flag summerSale {
  key: "summer-sale"
  description: "Shows the summer sale banner"
  defaultValue: false
}

flag checkout {
  options: ["control", "express"]
  defaultValue: "control"
}

flag heroText {
  key: "hero-text"
  source: "marketing"
  defaultValue: "Welcome"
}
`;

  it('writes a use flags module with defineSource and source.bindFlag', () => {
    const { code, sources } = compileFlagsFile(text, {
      fileName: path.join(directory, 'app/shop.flags'),
    });
    expect(sources.map((source) => [source.name, source.provider])).toEqual([
      [
        'shop',
        { file: path.join(directory, 'flags/sources/shop/provider.ts') },
      ],
      [
        'marketing',
        { file: path.join(directory, 'flags/sources/marketing/provider.ts') },
      ],
    ]);
    expect(hasUseFlagsDirective(code)).toBe(true);
    expect(code).toContain(
      'import provider_0 from "../flags/sources/shop/provider.ts";',
    );
    expect(code).toContain(
      'import getEvaluationContext_0 from "../flags/sources/shop/context.ts";',
    );
    expect(code).toContain(
      'import provider_1 from "../flags/sources/marketing/provider.ts";',
    );
    expect(
      code,
    ).toContain(`export const summerSale = source_0.bindFlag("summer-sale", {
  type: "boolean",
  description: "Shows the summer sale banner",
  defaultValue: false,
});`);
    expect(code).toContain(
      'export const heroText = source_1.bindFlag("hero-text", {',
    );
    expect(code).toContain('  options: ["control", "express"],');
    expect(code).toContain('import * as __flagsSelf from "./shop.flags";');
  });

  it('uses VercelProvider for self with @vercel/flags-core', async () => {
    const app = await mkdtemp(path.join(tmpdir(), 'flags-file-self-'));
    try {
      await writeFile(
        path.join(app, 'package.json'),
        JSON.stringify({ dependencies: { '@vercel/flags-core': '*' } }),
      );
      const { code } = compileFlagsFile('flag a\n', {
        fileName: path.join(app, 'app.flags'),
        selfRegistration: false,
      });
      expect(code).toContain(
        "import { VercelProvider } from '@vercel/flags-core/openfeature';",
      );
      expect(code).toContain('const provider_0 = new VercelProvider();');
      expect(code).toContain('project: {"system":"vercel-flags"},');
      expect(code).not.toContain('registerFlags');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it('throws with the position of each error', () => {
    expect(() =>
      compileFlagsFile('flag a {\n  type: "bool",\n}\n', {
        fileName: path.join(directory, 'app.flags'),
      }),
    ).toThrow(FlagsFileError);
    expect(() =>
      compileFlagsFile('flag a {\n  type: "bool",\n}\n', {
        fileName: path.join(directory, 'app.flags'),
      }),
    ).toThrow('app.flags:2:9 - error: "type" must be');
  });

  it('throws if a source has no provider', () => {
    expect(() =>
      compileFlagsFile('source other\nflag a\n', {
        fileName: path.join(directory, 'app.flags'),
      }),
    ).toThrow(
      'flags: The source "other" needs flags/sources/other/provider.ts.',
    );
    expect(() =>
      compileFlagsFile('source shop\nflag a {\n  source: "other"\n}\n', {
        fileName: path.join(directory, 'app.flags'),
      }),
    ).toThrow(
      'flags: The source "other" needs flags/sources/other/provider.ts.',
    );
  });

  it('runs: each flag evaluates with the provider of its source', async () => {
    const file = path.join(directory, 'app/compiled.ts');
    const { code } = compileFlagsFile(text, {
      fileName: path.join(directory, 'app/shop.flags'),
      selfRegistration: false,
    });
    await writeFile(file, code);
    const module = (await import(file)) as Record<
      string,
      ((options?: object) => Promise<unknown>) & { key: string }
    >;
    const context = { evaluationContext: { teamId: 't1' } };
    expect(module.summerSale?.key).toBe('summer-sale');
    expect(await module.summerSale?.(context)).toBe(true);
    expect(await module.checkout?.(context)).toBe('express');
    // From the provider of the source marketing
    expect(await module.heroText?.()).toBe('Hello again');
  });

  describe('the types', () => {
    const root = path.resolve(__dirname, '../..');

    function check(consumer: string): string[] {
      const types = renderFlagsFileTypes(text, {
        fileName: path.join(directory, 'app/shop.flags'),
      });
      expect(types.diagnostics).toEqual([]);
      const config = ts.readConfigFile(
        path.join(root, 'tsconfig.json'),
        ts.sys.readFile,
      );
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
      const options: ts.CompilerOptions = {
        ...parsed.options,
        noEmit: true,
        incremental: false,
        allowArbitraryExtensions: true,
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
      const files = new Map([
        [path.join(directory, 'app/consumer.ts'), consumer],
        // The declarations of shop.flags for TypeScript before 7.1
        [path.join(directory, 'app/shop.d.flags.ts'), types.text],
      ]);
      const host = ts.createCompilerHost(options);
      const getSourceFile = host.getSourceFile;
      const fileExists = host.fileExists;
      host.fileExists = (name) => files.has(name) || fileExists(name);
      host.getSourceFile = (name, version) => {
        const content = files.get(name);
        return content === undefined
          ? getSourceFile(name, version)
          : ts.createSourceFile(name, content, version);
      };
      const program = ts.createProgram(
        [path.join(directory, 'app/consumer.ts')],
        options,
        host,
      );
      return ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
    }

    it('gives each flag the type of hand-written code', () => {
      expect(
        check(`
          import { checkout, heroText, summerSale } from './shop.flags';
          const ctx = { evaluationContext: { teamId: 'acme' } };
          const sale: Promise<boolean> = summerSale(ctx);
          const flow: Promise<'control' | 'express' | (string & {})> = checkout(ctx);
          export const key: 'summer-sale' = summerSale.key;
          // The source marketing has no context.ts, so no input
          const hero: Promise<string> = heroText();
          export { sale, flow, hero };
        `),
      ).toEqual([]);
    });

    it('requires the input of context.ts of the source of a flag', () => {
      const errors = check(`
        import { summerSale } from './shop.flags';
        summerSale();
      `);
      expect(errors).toHaveLength(1);
    });

    it('maps each export to the name of its flag', () => {
      const types = renderFlagsFileTypes(text, {
        fileName: path.join(directory, 'app/shop.flags'),
      });
      const mapped = types.mappings.map((mapping) => [
        types.text.slice(
          mapping.generatedStart,
          mapping.generatedStart + mapping.generatedLength,
        ),
        text.slice(
          mapping.originalStart,
          mapping.originalStart + mapping.originalLength,
        ),
      ]);
      expect(mapped).toEqual([
        ['flag_0', 'summerSale'],
        ['summerSale', 'summerSale'],
        ['flag_1', 'checkout'],
        ['checkout', 'checkout'],
        ['flag_2', 'heroText'],
        ['heroText', 'heroText'],
      ]);
    });
  });
});

describe('declaration files', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'flags-declarations-'));
    await writeFile(path.join(directory, 'package.json'), '{}');
    await mkdir(path.join(directory, 'flags/sources/self'), {
      recursive: true,
    });
    await writeFile(
      path.join(directory, 'flags/sources/self/provider.ts'),
      'export default {};',
    );
    // Editors with an older TypeScript need the declaration files also
    // when TypeScript 7.1 reads the flags files with the content mapper
    await writeFile(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { allowArbitraryExtensions: true },
        contentMappers: [{ package: 'flags', extensions: ['.flags'] }],
      }),
    );
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes them also with the content mapper in tsconfig.json', async () => {
    const file = path.join(directory, 'app.flags');
    await writeFile(file, 'flag summerSale\n');
    const result = await writeFlagsFileDeclarations(directory);
    expect(result.files).toEqual(['app.flags']);
    const declaration = await readFile(declarationFileOf(file), 'utf8');
    expect(declaration).toContain('summerSale');
  });

  it('writes the file of one flags file only if it changed', async () => {
    const file = path.join(directory, 'checkout.flags');
    const text = 'flag checkout {\n  options: ["control", "express"]\n}\n';
    expect(writeFlagsFileDeclaration(file, text, directory)).toBe(true);
    expect(writeFlagsFileDeclaration(file, text, directory)).toBe(false);
    expect(await readFile(declarationFileOf(file), 'utf8')).toContain(
      'checkout',
    );
  });
});
