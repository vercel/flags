/**
 * The manifest of the flags of an application, e.g. for Flags Explorer. A
 * framework, or the script `flags manifest`, imports the modules with the
 * `'use flags'` directive and gives their exports to `createManifest`.
 *
 * The manifest comes only from the exported objects. It does not evaluate
 * flags, and it does not depend on how the flags were created.
 */
import stringify from 'fast-json-stable-stringify';
import { findPlatformProject } from './overrides/vercel';
import { runtime } from './runtime';
import { systemManifestUrls } from './source';
import { isSafeUrl } from './system-manifest';
import {
  describeValue,
  type FlagOptionObject,
  type FlagType,
  type FlagValue,
  hasType,
  isFlagType,
  normalizeOptions,
} from './value-types';

/**
 * A module with the `'use flags'` directive, and its exports.
 */
export interface FlagsModule {
  /**
   * The path of the module, relative to the project, e.g. `flags.ts`.
   */
  readonly id: string;
  /**
   * The module namespace object, e.g. of `import()`.
   */
  readonly exports: Record<string, unknown>;
}

/**
 * Where a flag is declared in the code.
 */
export interface FlagDeclaration {
  readonly module: string;
  readonly export: string;
}

/**
 * What the manifest knows about one flag. The fields have the names of the
 * definitions of Flags Explorer.
 */
export interface FlagManifestDefinition {
  readonly type: FlagType;
  readonly options?: readonly FlagOptionObject<FlagValue>[];
  readonly defaultValue?: FlagValue;
  readonly description?: string;
  /**
   * Always `true`: the flag is declared in the code of the application.
   */
  readonly declaredInCode: true;
  /**
   * The id of the source of the flag in `sources`.
   */
  readonly source?: string;
  /**
   * The exports which declare the flag. Usually one.
   */
  readonly declarations: readonly FlagDeclaration[];
}

/**
 * A source of the flags: its system, and the variables of its
 * project. A tool builds the links to the dashboard from the provider
 * manifest and the variables (see `resolveFlagLinks`). The links are not in
 * the file, so a system can change them without a new build.
 */
export interface FlagManifestSource {
  readonly system: string;
  /**
   * The URL of the system manifest of the system, if it has one.
   */
  readonly systemManifest?: string;
  /**
   * The fields of the project, e.g. `projectId`. Public identifiers, never
   * credentials.
   */
  readonly variables: Readonly<Record<string, string>>;
}

export interface FlagsManifest {
  readonly version: 1;
  /**
   * The sources, by an id which the definitions use.
   */
  readonly sources: Readonly<Record<string, FlagManifestSource>>;
  /**
   * The flags, by key, in the order of their keys.
   */
  readonly definitions: Readonly<Record<string, FlagManifestDefinition>>;
}

/**
 * The fields of an exported object which the manifest reads.
 */
interface ExportedFlag {
  readonly key: string;
  readonly source?: unknown;
  readonly type?: unknown;
  readonly options?: unknown;
  readonly defaultValue?: unknown;
  readonly description?: unknown;
}

/**
 * Whether an export is a flag: an object or a function with a key. A flag
 * of `defineFlag` is a function with a key.
 *
 * @internal
 */
export function isExportedFlag(value: unknown): value is ExportedFlag {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { key?: unknown }).key === 'string' &&
    (value as { key: string }).key !== ''
  );
}

function definitionOf(
  flag: ExportedFlag,
  where: string,
): Omit<FlagManifestDefinition, 'declarations'> {
  const type = flag.type ?? 'boolean';
  if (!isFlagType(type)) {
    throw new Error(
      `flags: ${where} has the type ${describeValue(type)}, which is not boolean, string, number or object.`,
    );
  }
  if (flag.options !== undefined && !Array.isArray(flag.options)) {
    throw new Error(`flags: The options of ${where} must be an array.`);
  }
  if (flag.defaultValue !== undefined && !hasType(flag.defaultValue, type)) {
    throw new Error(
      `flags: The defaultValue of ${where} is ${describeValue(flag.defaultValue)}, not a ${type}.`,
    );
  }
  if (flag.description !== undefined && typeof flag.description !== 'string') {
    throw new Error(`flags: The description of ${where} must be a string.`);
  }
  const options = normalizeOptions(flag.key, type, flag.options);
  return {
    type,
    ...(options ? { options } : {}),
    ...(flag.defaultValue !== undefined
      ? { defaultValue: flag.defaultValue as FlagValue }
      : {}),
    ...(flag.description !== undefined
      ? { description: flag.description }
      : {}),
    declaredInCode: true,
  };
}

/**
 * The source of a flag in the manifest. A flag without a source uses the
 * default source.
 */
function sourceOf(flag: ExportedFlag): FlagManifestSource | undefined {
  const source = (flag.source ?? runtime.defaultSource) as {
    project?: unknown;
  };
  const project = source?.project as Record<string, unknown> | undefined;
  if (typeof project !== 'object' || project === null) return undefined;
  const { system, systemManifest, ...fields } = project;
  if (typeof system !== 'string') return undefined;
  const variables: Record<string, string> = {};
  // Vercel Flags uses the platform project of Vercel as its flag project, so
  // the variables come from the environment of the build. The fields of the
  // project override them, for the flags of a different project.
  if (system === 'vercel-flags') {
    for (const [name, value] of Object.entries(findPlatformProject())) {
      if (value) variables[name] = value;
    }
  }
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'string') variables[name] = value;
  }
  const url =
    typeof systemManifest === 'string'
      ? systemManifest
      : systemManifestUrls[system as keyof typeof systemManifestUrls];
  return {
    system,
    ...(url ? { systemManifest: url } : {}),
    variables,
  };
}

/**
 * Creates the manifest from the exports of the modules with the
 * `'use flags'` directive.
 *
 * Throws if an export is not a flag, because such a module exports only
 * flags. Two exports with the same key must declare the same flag.
 *
 * @example
 * ```ts
 * const manifest = createManifest([
 *   { id: 'flags.ts', exports: await import('./flags') },
 * ]);
 * ```
 */
export function createManifest(modules: readonly FlagsModule[]): FlagsManifest {
  const found = new Map<
    string,
    {
      definition: Omit<FlagManifestDefinition, 'declarations' | 'source'>;
      source: FlagManifestSource | undefined;
      declarations: FlagDeclaration[];
    }
  >();
  for (const module of modules) {
    for (const [name, value] of Object.entries(module.exports)) {
      if (!isExportedFlag(value)) {
        throw new Error(
          `flags: Export "${name}" of ${module.id} is not a flag. A module with 'use flags' exports only flags.`,
        );
      }
      const where = `flag "${value.key}" (export "${name}" of ${module.id})`;
      const definition = definitionOf(value, where);
      const source = sourceOf(value);
      const declaration = { module: module.id, export: name };
      const existing = found.get(value.key);
      if (!existing) {
        found.set(value.key, {
          definition,
          source,
          declarations: [declaration],
        });
        continue;
      }
      if (
        stringify(existing.definition) !== stringify(definition) ||
        stringify(existing.source ?? null) !== stringify(source ?? null)
      ) {
        const first = existing.declarations[0];
        throw new Error(
          `flags: Flag "${value.key}" is declared two times with different values: export "${first?.export}" of ${first?.module}, and export "${name}" of ${module.id}.`,
        );
      }
      existing.declarations.push(declaration);
    }
  }

  // The ids of the sources: the system, and a number if two sources have
  // the same system. In the order of the keys of the flags, so that the
  // file is stable.
  const sources: Record<string, FlagManifestSource> = {};
  const ids = new Map<string, string>();
  const entries = [...found.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const definitions = Object.fromEntries(
    entries.map(([key, { definition, source, declarations }]) => {
      let id: string | undefined;
      if (source) {
        const content = stringify(source);
        id = ids.get(content);
        if (!id) {
          id = source.system;
          for (let n = 2; Object.hasOwn(sources, id); n++) {
            id = `${source.system}-${n}`;
          }
          ids.set(content, id);
          sources[id] = source;
        }
      }
      return [
        key,
        { ...definition, ...(id ? { source: id } : {}), declarations },
      ];
    }),
  );
  return { version: 1, sources, definitions };
}

const flagTypes = ['boolean', 'string', 'number', 'object'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks a flags manifest, e.g. after a tool reads `flags-manifest.json`.
 * Throws if it does not follow version 1 of the format (the schema is at
 * https://flags-sdk.dev/schemas/flags-manifest.v1.json). Fields which are
 * not known are allowed, so that later versions can add them.
 */
export function validateFlagsManifest(value: unknown): FlagsManifest {
  const fail = (message: string): never => {
    throw new TypeError(`flags: The flags manifest is not valid: ${message}`);
  };
  if (!isRecord(value)) return fail('it is not an object.');
  if (value.version !== 1) return fail('the version is not 1.');
  if (!isRecord(value.sources)) return fail('sources is missing.');
  if (!isRecord(value.definitions)) return fail('definitions is missing.');
  for (const [id, source] of Object.entries(value.sources)) {
    if (!isRecord(source) || typeof source.system !== 'string') {
      fail(`source "${id}" has no system.`);
    }
    const { variables, systemManifest } = source as Record<string, unknown>;
    if (
      !isRecord(variables) ||
      Object.values(variables).some((v) => typeof v !== 'string')
    ) {
      fail(`the variables of source "${id}" must be strings.`);
    }
    if (systemManifest !== undefined && !isSafeUrl(systemManifest)) {
      fail(`the systemManifest of source "${id}" must be an HTTPS URL.`);
    }
  }
  const keys = Object.keys(value.definitions);
  if (keys.some((key, i) => i > 0 && (keys[i - 1] as string) > key)) {
    fail('the definitions are not sorted by key.');
  }
  for (const [key, definition] of Object.entries(value.definitions)) {
    if (!isRecord(definition)) return fail(`flag "${key}" is not an object.`);
    if (!flagTypes.includes(definition.type as string)) {
      fail(`flag "${key}" has no valid type.`);
    }
    if (definition.declaredInCode !== true) {
      fail(`flag "${key}" must have declaredInCode: true.`);
    }
    if (
      definition.source !== undefined &&
      !Object.hasOwn(value.sources, definition.source as string)
    ) {
      fail(`flag "${key}" refers to a source which is not known.`);
    }
    if (
      !Array.isArray(definition.declarations) ||
      definition.declarations.length === 0 ||
      !definition.declarations.every(
        (declaration) =>
          isRecord(declaration) &&
          typeof declaration.module === 'string' &&
          typeof declaration.export === 'string',
      )
    ) {
      fail(`flag "${key}" has no valid declarations.`);
    }
    if (
      definition.options !== undefined &&
      (!Array.isArray(definition.options) ||
        !definition.options.every((o) => isRecord(o) && 'value' in o))
    ) {
      fail(`the options of flag "${key}" must be objects with a value.`);
    }
  }
  return value as unknown as FlagsManifest;
}

export {
  expandTemplate,
  type FlagLinks,
  resolveFlagLinks,
  type SystemManifest,
  type SystemManifestLinks,
  validateSystemManifest,
} from './system-manifest';
