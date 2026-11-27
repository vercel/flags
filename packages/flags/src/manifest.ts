/**
 * The manifest of the flags of an application, e.g. for Flags Explorer. A
 * framework plugin imports the modules with the `'use flags'` directive and
 * gives their exports to `createManifest`.
 *
 * The manifest comes only from the exported objects. It does not evaluate
 * flags.
 */

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
 * The type of the values of a flag.
 */
export type FlagType = 'boolean' | 'string' | 'number' | 'object';

/**
 * A value of a flag, as JSON.
 */
export type FlagManifestValue =
  | boolean
  | string
  | number
  | null
  | readonly FlagManifestValue[]
  | { readonly [key: string]: FlagManifestValue };

/**
 * A value which a flag can return, with an optional label.
 */
export interface FlagManifestOption {
  readonly value: FlagManifestValue;
  readonly label?: string;
}

/**
 * What the manifest knows about one flag. The fields have the names of the
 * definitions of Flags Explorer.
 */
export interface FlagManifestDefinition {
  /**
   * The type of the values. It comes from `defaultValue`, or from `options`
   * when all options have the same type. Without them, it is not known.
   */
  readonly type?: FlagType;
  readonly options?: readonly FlagManifestOption[];
  readonly defaultValue?: FlagManifestValue;
  readonly description?: string;
  /**
   * Always `true`: the flag is declared in the code of the application.
   */
  readonly declaredInCode: true;
  /**
   * The exports which declare the flag. Usually one.
   */
  readonly declarations: readonly FlagDeclaration[];
}

export interface FlagsManifest {
  readonly version: 1;
  /**
   * The sources of the flags, by an id. Always empty for now: a later
   * version of the SDK adds the sources of the flags.
   */
  readonly sources: Readonly<Record<string, never>>;
  /**
   * The flags, by key, in the order of their keys.
   */
  readonly definitions: Readonly<Record<string, FlagManifestDefinition>>;
}

/**
 * The fields of an exported flag which the manifest reads, e.g. of `flag()`.
 */
interface ExportedFlag {
  readonly key: string;
  readonly options?: unknown;
  readonly defaultValue?: unknown;
  readonly description?: unknown;
}

/**
 * Whether an export is a flag: an object or a function with a key. A flag
 * of `flag()` is a function with a key.
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

function typeOf(value: unknown): FlagType {
  switch (typeof value) {
    case 'boolean':
    case 'string':
    case 'number':
      return typeof value as FlagType;
    default:
      return 'object';
  }
}

/**
 * The options as objects with a value. `flag()` already gives objects, but
 * a plain object can also have values as options.
 */
function normalizeOptions(
  options: readonly unknown[],
  where: string,
): FlagManifestOption[] {
  return options.map((option) => {
    if (typeof option !== 'object' || option === null) {
      return { value: option as FlagManifestValue };
    }
    if (!('value' in option)) {
      throw new Error(
        `flags: An option of ${where} is an object without a value.`,
      );
    }
    const { value, label } = option as { value: unknown; label?: unknown };
    if (label !== undefined && typeof label !== 'string') {
      throw new Error(
        `flags: The label of an option of ${where} is not a string.`,
      );
    }
    return {
      value: value as FlagManifestValue,
      ...(label !== undefined ? { label } : {}),
    };
  });
}

function inferType(
  defaultValue: unknown,
  options: readonly FlagManifestOption[] | undefined,
): FlagType | undefined {
  if (defaultValue !== undefined) {
    return typeOf(defaultValue);
  }
  if (!options || options.length === 0) {
    return undefined;
  }
  const types = new Set(options.map((option) => typeOf(option.value)));
  if (types.size !== 1) {
    return undefined;
  }
  return [...types][0];
}

function definitionOf(
  flag: ExportedFlag,
  where: string,
): Omit<FlagManifestDefinition, 'declarations'> {
  if (flag.options !== undefined && !Array.isArray(flag.options)) {
    throw new Error(`flags: The options of ${where} must be an array.`);
  }
  if (flag.description !== undefined && typeof flag.description !== 'string') {
    throw new Error(`flags: The description of ${where} must be a string.`);
  }
  const options = flag.options
    ? normalizeOptions(flag.options, where)
    : undefined;
  const type = inferType(flag.defaultValue, options);
  return {
    ...(type ? { type } : {}),
    ...(options ? { options } : {}),
    ...(flag.defaultValue !== undefined
      ? { defaultValue: flag.defaultValue as FlagManifestValue }
      : {}),
    ...(flag.description !== undefined
      ? { description: flag.description }
      : {}),
    declaredInCode: true,
  };
}

/**
 * JSON with the keys of each object in order, so that two equal
 * definitions give the same text.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (
      typeof nested !== 'object' ||
      nested === null ||
      Array.isArray(nested)
    ) {
      return nested;
    }
    return Object.fromEntries(
      Object.entries(nested).sort(([a], [b]) => compare(a, b)),
    );
  });
}

function compare(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
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
      definition: Omit<FlagManifestDefinition, 'declarations'>;
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
      const declaration = { module: module.id, export: name };
      const existing = found.get(value.key);
      if (!existing) {
        found.set(value.key, { definition, declarations: [declaration] });
        continue;
      }
      if (
        stableStringify(existing.definition) !== stableStringify(definition)
      ) {
        const first = existing.declarations[0];
        throw new Error(
          `flags: Flag "${value.key}" is declared two times with different values: export "${first?.export}" of ${first?.module}, and export "${name}" of ${module.id}.`,
        );
      }
      existing.declarations.push(declaration);
    }
  }

  const definitions = Object.fromEntries(
    [...found.entries()]
      .sort(([a], [b]) => compare(a, b))
      .map(([key, { definition, declarations }]) => [
        key,
        { ...definition, declarations },
      ]),
  );
  return { version: 1, sources: {}, definitions };
}

const flagTypes = ['boolean', 'string', 'number', 'object'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks a flags manifest, e.g. after a tool reads `flags-manifest.json`.
 * Throws if it does not follow version 1 of the format. Fields which are not
 * known are allowed, so that later versions can add them.
 */
export function validateFlagsManifest(value: unknown): FlagsManifest {
  const fail = (message: string): never => {
    throw new TypeError(`flags: The flags manifest is not valid: ${message}`);
  };
  if (!isRecord(value)) {
    return fail('it is not an object.');
  }
  if (value.version !== 1) {
    return fail('the version is not 1.');
  }
  if (!isRecord(value.sources)) {
    return fail('sources is missing.');
  }
  if (!isRecord(value.definitions)) {
    return fail('definitions is missing.');
  }
  const keys = Object.keys(value.definitions);
  if (keys.some((key, i) => i > 0 && (keys[i - 1] as string) > key)) {
    fail('the definitions are not sorted by key.');
  }
  for (const [key, definition] of Object.entries(value.definitions)) {
    if (!isRecord(definition)) {
      return fail(`flag "${key}" is not an object.`);
    }
    if (
      definition.type !== undefined &&
      !flagTypes.includes(definition.type as string)
    ) {
      fail(`flag "${key}" has no valid type.`);
    }
    if (definition.declaredInCode !== true) {
      fail(`flag "${key}" must have declaredInCode: true.`);
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
