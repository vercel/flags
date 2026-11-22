/**
 * Turns a flags file into code: the module which the bundler runs, and the
 * types which TypeScript sees. Both are the same as hand-written code with
 * `defineSource` and `source.bindFlag`.
 *
 * The source of a flags file is the folder `flags/sources/<source>` of the
 * application, with `provider.ts` and an optional `context.ts` and
 * `hooks.ts`. The default source `self` of an application which depends on
 * `@vercel/flags-core` needs no folder: its provider is `VercelProvider`.
 *
 * Nothing here uses the network. The result depends only on the files of
 * the application.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { readSettings } from '../config-file';
import type { Project } from '../source';
import type { FlagType } from '../value-types';
import {
  type FlagsFileDiagnostic,
  type FlagsFileDocument,
  type FlagsFileFlag,
  isPlainIdentifier,
  parseFlagsFile,
} from './document';

const VERCEL_FLAGS_PACKAGE = '@vercel/flags-core';
const VERCEL_PROVIDER_MODULE = '@vercel/flags-core/openfeature';
const SOURCE_FILE_EXTENSIONS = ['ts', 'mts', 'tsx', 'js', 'mjs'];

/**
 * The source of a flags file, and the files which define it.
 */
export interface FlagsFileSource {
  readonly name: string;
  /** The folder `flags/sources/<name>`, if the application has it */
  readonly directory?: string;
  /**
   * `provider.ts` of the folder, or `vercel` for `new VercelProvider()` of
   * the default source `self`.
   */
  readonly provider: { readonly file: string } | 'vercel';
  /** `context.ts` of the folder, if it has one */
  readonly context?: string;
  /** `hooks.ts` of the folder, if it has one */
  readonly hooks?: string;
  readonly project?: Project;
}

/**
 * A flags file has an error. The message has the position of each error,
 * e.g. `app.flags:4:16 - error: …`.
 */
export class FlagsFileError extends Error {
  readonly diagnostics: readonly FlagsFileDiagnostic[];

  constructor(message: string, diagnostics: readonly FlagsFileDiagnostic[]) {
    super(message);
    this.name = 'FlagsFileError';
    this.diagnostics = diagnostics;
  }
}

/**
 * The line and the column (both from 1) of an offset.
 */
export function positionOf(
  text: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text.charCodeAt(index) === 10) {
      line++;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/**
 * The diagnostics as text, as a compiler shows them: one line with the
 * position and the message, then the line of the file with a marker.
 */
export function formatDiagnostics(
  fileName: string,
  text: string,
  diagnostics: readonly FlagsFileDiagnostic[],
): string {
  const lines = text.split(/\r?\n/);
  return diagnostics
    .map((diagnostic) => {
      const { line, column } = positionOf(text, diagnostic.start);
      const source = lines[line - 1] ?? '';
      const width = Math.max(
        1,
        Math.min(diagnostic.length, source.length - column + 1),
      );
      return [
        `${fileName}:${line}:${column} - ${diagnostic.severity}: ${diagnostic.message}`,
        '',
        `  ${source}`,
        `  ${' '.repeat(column - 1)}${'~'.repeat(width)}`,
      ].join('\n');
    })
    .join('\n\n');
}

function isDirectory(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The directory of the application of a file: the nearest directory with a
 * `package.json`, from the directory of the file upwards. Without one, the
 * directory of the file.
 */
export function findProjectDirectory(file: string): string {
  const start = path.dirname(path.resolve(file));
  let directory = start;
  for (;;) {
    if (existsSync(path.join(directory, 'package.json'))) {
      return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return start;
    }
    directory = parent;
  }
}

/**
 * Whether the application depends on `@vercel/flags-core`, in any kind of
 * dependency of its `package.json`. This turns on the default source
 * `self`.
 *
 * @internal
 */
export function dependsOnVercelFlagsSync(projectDirectory: string): boolean {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(
      readFileSync(path.join(projectDirectory, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;
  } catch {
    return false;
  }
  return [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ].some((kind) => {
    const dependencies = manifest[kind];
    return (
      typeof dependencies === 'object' &&
      dependencies !== null &&
      VERCEL_FLAGS_PACKAGE in dependencies
    );
  });
}

function findFile(directory: string, name: string): string | undefined {
  for (const extension of SOURCE_FILE_EXTENSIONS) {
    const file = path.join(directory, `${name}.${extension}`);
    if (existsSync(file)) {
      return file;
    }
  }
  return undefined;
}

/**
 * The folders in which the SDK looks for the folder of a source, in this
 * order. For the watch of a bundler.
 */
export function sourceDirectoryCandidates(
  projectDirectory: string,
  name: string,
): string[] {
  return [
    path.join(projectDirectory, 'flags', 'sources', name),
    path.join(projectDirectory, 'src', 'flags', 'sources', name),
  ];
}

/**
 * Finds the parts of a source: the folder `flags/sources/<name>` in the
 * application or in its `src`, or the default source `self` of Vercel
 * Flags. Throws if the source has no provider.
 */
export function resolveFlagsSource(
  projectDirectory: string,
  name: string,
): FlagsFileSource {
  const directory = sourceDirectoryCandidates(projectDirectory, name).find(
    isDirectory,
  );
  const providerFile = directory ? findFile(directory, 'provider') : undefined;
  const context = directory ? findFile(directory, 'context') : undefined;
  const hooks = directory ? findFile(directory, 'hooks') : undefined;
  const parts = {
    name,
    ...(directory ? { directory } : {}),
    ...(context ? { context } : {}),
    ...(hooks ? { hooks } : {}),
  };
  if (providerFile) {
    return { ...parts, provider: { file: providerFile } };
  }
  const isDefault =
    name === 'self' &&
    readSettings(projectDirectory).selfSource !== false &&
    dependsOnVercelFlagsSync(projectDirectory);
  if (isDefault) {
    return {
      ...parts,
      provider: 'vercel',
      project: { system: 'vercel-flags' },
    };
  }
  const folder = directory
    ? path.relative(projectDirectory, directory).split(path.sep).join('/')
    : `flags/sources/${name}`;
  throw new Error(
    name === 'self'
      ? `flags: The source "self" needs ${folder}/provider.ts, or the dependency @vercel/flags-core for the flags of Vercel Flags.`
      : `flags: The source "${name}" needs ${folder}/provider.ts.`,
  );
}

/**
 * The import of a file from a module in `fromDirectory`, e.g.
 * `./flags/sources/self/provider.ts`.
 */
function relativeImport(fromDirectory: string, file: string): string {
  const relative = path.relative(fromDirectory, file).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

const MAX_DOC_VALUE_LENGTH = 40;
const MAX_DOC_OPTIONS = 10;

function inlineCode(value: unknown): string {
  let text = JSON.stringify(value) ?? String(value);
  if (text.length > MAX_DOC_VALUE_LENGTH) {
    text = `${text.slice(0, MAX_DOC_VALUE_LENGTH - 1)}…`;
  }
  return text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``;
}

/**
 * The JSDoc of a flag: its description, its options and its default value,
 * as paragraphs, so that the editor shows them on hover.
 */
export function jsDocOf(flag: FlagsFileFlag, fileName: string): string[] {
  const parts: string[] = [];
  if (flag.description) {
    parts.push(flag.description);
  }
  if (flag.options && flag.options.length > 0) {
    const shown = flag.options
      .slice(0, MAX_DOC_OPTIONS)
      .map((option) =>
        option.label === undefined
          ? inlineCode(option.value)
          : `${inlineCode(option.value)} (${option.label})`,
      );
    const more = flag.options.length - shown.length;
    parts.push(
      `Options: ${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}`,
    );
  }
  if (flag.defaultValue !== undefined) {
    parts.push(`Default value: ${inlineCode(flag.defaultValue)}`);
  } else {
    parts.push('No default value: a failed evaluation throws.');
  }
  const label =
    /^[\p{ID_Start}$_](?:[\p{ID_Continue}$\u200c\u200d]|-(?=[\p{ID_Continue}$]))*$/u.test(
      flag.key,
    )
      ? flag.key
      : JSON.stringify(flag.key);
  parts.push(`Declared in ${fileName} as \`flag ${label}\`.`);
  return [
    '/**',
    ...parts
      .join('\n\n')
      .replace(/\*\//g, '*\\/')
      .split(/\r?\n/)
      .map((line) => (line ? ` * ${line}` : ' *')),
    ' */',
  ];
}

function exportClause(local: string, exportName: string): string {
  const name = isPlainIdentifier(exportName)
    ? exportName
    : JSON.stringify(exportName);
  return `export { ${local} as ${name} };`;
}

/**
 * The options of a flag as code. An option of an object flag stays
 * `{ value }`, because a JSON object and an option object look the same.
 */
function optionsCode(flag: FlagsFileFlag): string | undefined {
  if (!flag.options) {
    return undefined;
  }
  const items = flag.options.map((option) => {
    if (flag.type === 'object' || option.label !== undefined) {
      return JSON.stringify(option);
    }
    return JSON.stringify(option.value);
  });
  return `[${items.join(', ')}]`;
}

export interface CompileOptions {
  /**
   * The path of the flags file. The imports of the module are relative to
   * its directory.
   */
  readonly fileName: string;
  /**
   * The directory of the application, with `flags/sources`. The default is
   * the nearest directory of the file with a `package.json`.
   */
  readonly projectDirectory?: string;
  /**
   * Whether the module registers its flags with `registerFlags` at its
   * end, as a framework plugin does for each `'use flags'` module. The
   * default is `true`.
   */
  readonly selfRegistration?: boolean;
}

export interface CompiledFlagsFile {
  /** The module: JavaScript, which is also valid TypeScript */
  readonly code: string;
  readonly document: FlagsFileDocument;
  readonly source: FlagsFileSource;
  /** The warnings of the file. An error throws. */
  readonly warnings: readonly FlagsFileDiagnostic[];
}

function throwOnErrors(
  fileName: string,
  text: string,
  document: FlagsFileDocument,
) {
  const errors = document.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (errors.length > 0) {
    throw new FlagsFileError(
      `flags: ${path.basename(fileName)} has ${errors.length === 1 ? 'an error' : `${errors.length} errors`}.\n\n${formatDiagnostics(path.basename(fileName), text, errors)}`,
      errors,
    );
  }
}

/**
 * Compiles a flags file into a module with the `'use flags'` directive:
 * one `defineSource`, and one `source.bindFlag` for each flag, in the order
 * of the file. Throws a `FlagsFileError` if the file has an error.
 */
export function compileFlagsFile(
  text: string,
  options: CompileOptions,
): CompiledFlagsFile {
  const fileName = path.resolve(options.fileName);
  const document = parseFlagsFile(text);
  throwOnErrors(options.fileName, text, document);
  const projectDirectory =
    options.projectDirectory ?? findProjectDirectory(fileName);
  const source = resolveFlagsSource(projectDirectory, document.source);
  const from = path.dirname(fileName);
  const base = path.basename(fileName);

  const lines = [
    `// Compiled by the Flags SDK from ${base}. Change ${base} instead.`,
    "'use flags';",
    '',
    "import { defineSource } from 'flags';",
  ];
  if (source.provider === 'vercel') {
    lines.push(`import { VercelProvider } from '${VERCEL_PROVIDER_MODULE}';`);
  } else {
    lines.push(
      `import provider from ${JSON.stringify(relativeImport(from, source.provider.file))};`,
    );
  }
  if (source.context) {
    lines.push(
      `import getEvaluationContext from ${JSON.stringify(relativeImport(from, source.context))};`,
    );
  }
  if (source.hooks) {
    lines.push(
      `import hooks from ${JSON.stringify(relativeImport(from, source.hooks))};`,
    );
  }
  lines.push('');
  if (source.provider === 'vercel') {
    // Each instance without arguments uses the same client of Vercel Flags
    lines.push('const provider = new VercelProvider();', '');
  }
  lines.push(
    'const source = defineSource({',
    '  provider,',
    ...(source.project
      ? [`  project: ${JSON.stringify(source.project)},`]
      : []),
    ...(source.context ? ['  getEvaluationContext,'] : []),
    ...(source.hooks ? ['  hooks,'] : []),
    '});',
    '',
  );
  for (const [index, flag] of document.flags.entries()) {
    const local = `flag_${index}`;
    const optionList = optionsCode(flag);
    lines.push(
      ...jsDocOf(flag, base),
      `const ${local} = source.bindFlag(${JSON.stringify(flag.key)}, {`,
      `  type: ${JSON.stringify(flag.type)},`,
      ...(optionList ? [`  options: ${optionList},`] : []),
      ...(flag.description !== undefined
        ? [`  description: ${JSON.stringify(flag.description)},`]
        : []),
      ...(flag.defaultValue !== undefined
        ? [`  defaultValue: ${JSON.stringify(flag.defaultValue)},`]
        : []),
      '});',
      exportClause(local, flag.exportName),
      '',
    );
  }
  if (options.selfRegistration ?? true) {
    lines.push(
      `import * as __flagsSelf from ${JSON.stringify(`./${base}`)};`,
      "import { registerFlags as __flagsRegisterFlags } from 'flags/runtime';",
      '__flagsRegisterFlags(__flagsSelf);',
      '',
    );
  }
  return {
    code: lines.join('\n'),
    document,
    source,
    warnings: document.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'warning',
    ),
  };
}

/**
 * A JSON value as a TypeScript type, e.g. `readonly ["a", 1]`.
 */
function literalType(value: unknown): string {
  if (Array.isArray(value)) {
    return `readonly [${value.map(literalType).join(', ')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const fields = Object.entries(value).map(
      ([key, item]) =>
        `readonly ${isPlainIdentifier(key) ? key : JSON.stringify(key)}: ${literalType(item)}`,
    );
    return fields.length === 0 ? '{}' : `{ ${fields.join('; ')} }`;
  }
  return JSON.stringify(value) ?? 'unknown';
}

function optionsType(flag: FlagsFileFlag): string {
  if (!flag.options) {
    return 'readonly unknown[]';
  }
  const items = flag.options.map((option) =>
    flag.type === 'object' || option.label !== undefined
      ? literalType(option)
      : literalType(option.value),
  );
  return `readonly [${items.join(', ')}]`;
}

function sourceTypeName(name: string): string {
  const words = name.split(/[^a-z0-9]+/i).filter(Boolean);
  return `${words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')}Source`;
}

/**
 * A span of the types which belongs to a span of the flags file, e.g. the
 * name of an export and the key of its flag. For the content mapper.
 */
export interface TypesMapping {
  /** In the types */
  readonly generatedStart: number;
  readonly generatedLength: number;
  /** In the flags file */
  readonly originalStart: number;
  readonly originalLength: number;
}

export interface FlagsFileTypes {
  /** TypeScript, which is also a valid declaration file (`.d.ts`) */
  readonly text: string;
  readonly mappings: readonly TypesMapping[];
  readonly document: FlagsFileDocument;
  /**
   * The diagnostics of the file, and an error at `source` if the source
   * has no provider.
   */
  readonly diagnostics: readonly FlagsFileDiagnostic[];
}

/**
 * The types of a flags file, for TypeScript: a declaration of each flag,
 * with the type which `source.bindFlag` gives in hand-written code. It
 * never throws: a flag with an error is left out, and the diagnostics say
 * why. Used by the content mapper of TypeScript 7.1, and for
 * `<name>.d.flags.ts` with older versions.
 */
export function renderFlagsFileTypes(
  text: string,
  options: Omit<CompileOptions, 'selfRegistration'>,
): FlagsFileTypes {
  const fileName = path.resolve(options.fileName);
  const document = parseFlagsFile(text);
  const diagnostics = [...document.diagnostics];
  const projectDirectory =
    options.projectDirectory ?? findProjectDirectory(fileName);
  const from = path.dirname(fileName);
  const base = path.basename(fileName);
  let source: FlagsFileSource | undefined;
  try {
    source = resolveFlagsSource(projectDirectory, document.source);
  } catch (error) {
    const span = document.sourceSpan ?? { start: 0, end: 0 };
    diagnostics.push({
      severity: 'error',
      message: (error as Error).message.replace(/^flags: /, ''),
      start: span.start,
      length: Math.max(span.end - span.start, 1),
      code: 9,
    });
  }

  let output = '';
  const mappings: TypesMapping[] = [];
  const line = (value = '') => {
    output += `${value}\n`;
  };
  /** Appends text which maps to a span of the flags file */
  const mapped = (
    value: string,
    originalStart: number,
    originalLength: number,
  ) => {
    mappings.push({
      generatedStart: output.length,
      generatedLength: value.length,
      originalStart,
      originalLength,
    });
    output += value;
  };

  line(`// The types of ${base}, by the Flags SDK. Change ${base} instead.`);
  line(
    "import type { EvaluationContext, Flag, FlagManagementSystem, FlagValueFrom, Source } from 'flags';",
  );
  line();
  if (source === undefined) {
    line('type Provider = never;');
  } else if (source.provider === 'vercel') {
    line(
      `type Provider = InstanceType<(typeof import('${VERCEL_PROVIDER_MODULE}'))['VercelProvider']>;`,
    );
  } else {
    line(
      `type Provider = (typeof import(${JSON.stringify(relativeImport(from, source.provider.file))}))['default'];`,
    );
  }
  if (source?.context) {
    line(
      `type Context = (typeof import(${JSON.stringify(relativeImport(from, source.context))}))['default'];`,
    );
    line('// The input after the request, or undefined without one');
    line(
      'type Rest = Parameters<Context> extends [unknown, ...infer R] ? R : [];',
    );
    line(
      'type First = Rest extends [(infer I)?, ...unknown[]] ? I : undefined;',
    );
    line('type Input = Rest extends [] ? undefined : First;');
  } else {
    line('type Input = undefined;');
  }
  const sourceName = sourceTypeName(document.source);
  line();
  line(`/** The source \`${document.source}\` of ${base}. */`);
  line(
    `interface ${sourceName} extends Source<Provider, FlagManagementSystem, EvaluationContext, Input> {}`,
  );
  line();
  for (const [index, flag] of document.flags.entries()) {
    const local = `flag_${index}`;
    const keyLength = flag.keySpan.end - flag.keySpan.start;
    for (const docLine of jsDocOf(flag, base)) {
      line(docLine);
    }
    output += 'declare const ';
    mapped(local, flag.keySpan.start, keyLength);
    line(
      `: Flag<${sourceName}, ${JSON.stringify(flag.key)}, Input, FlagValueFrom<${JSON.stringify(flag.type satisfies FlagType)}, ${optionsType(flag)}>>;`,
    );
    output += `export { ${local} as `;
    mapped(
      isPlainIdentifier(flag.exportName)
        ? flag.exportName
        : JSON.stringify(flag.exportName),
      flag.keySpan.start,
      keyLength,
    );
    line(' };');
    line();
  }
  if (document.flags.length === 0) {
    line('export {};');
  }
  return { text: output, mappings, document, diagnostics };
}
