/**
 * The manifest of the flags of an application, e.g. for Flags Explorer. A
 * framework, or the script `flags manifest`, imports the modules with the
 * `'use flags'` directive and gives their exports to `createManifest`.
 *
 * The manifest comes only from the exported objects. It does not evaluate
 * flags, and it does not depend on how the flags were created.
 */
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
export interface FlagSource {
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
   * The exports which declare the flag. Usually one.
   */
  readonly sources: readonly FlagSource[];
}

export interface FlagsManifest {
  readonly version: 1;
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
): Omit<FlagManifestDefinition, 'sources'> {
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
      definition: Omit<FlagManifestDefinition, 'sources'>;
      sources: FlagSource[];
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
      const source = { module: module.id, export: name };
      const existing = found.get(value.key);
      if (!existing) {
        found.set(value.key, { definition, sources: [source] });
        continue;
      }
      if (JSON.stringify(existing.definition) !== JSON.stringify(definition)) {
        const first = existing.sources[0];
        throw new Error(
          `flags: Flag "${value.key}" is declared two times with different values: export "${first?.export}" of ${first?.module}, and export "${name}" of ${module.id}.`,
        );
      }
      existing.sources.push(source);
    }
  }
  const definitions = Object.fromEntries(
    [...found.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, { definition, sources }]) => [
        key,
        { ...definition, sources },
      ]),
  );
  return { version: 1, definitions };
}
