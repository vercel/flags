/**
 * The manifest of the flags of an application, e.g. for Flags Explorer. A
 * framework, or the script `flags manifest`, imports the modules with the
 * `'use flags'` directive and gives their exports to `createManifest`.
 *
 * The manifest comes only from the exported objects. It does not evaluate
 * flags, and it does not depend on how the flags were created.
 */
import stringify from 'fast-json-stable-stringify';
import { providerManifestUrls } from './connection';
import { findVercelProject } from './overrides/vercel';
import { runtime } from './runtime';
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
   * The id of the connection of the flag in `connections`.
   */
  readonly connection?: string;
  /**
   * The exports which declare the flag. Usually one.
   */
  readonly sources: readonly FlagSource[];
}

/**
 * A connection of the flags: its platform, and the variables of its
 * project. A tool builds the links to the dashboard from the provider
 * manifest and the variables (see `resolveFlagLinks`). The links are not in
 * the file, so a platform can change them without a new build.
 */
export interface FlagManifestConnection {
  readonly platform: string;
  /**
   * The URL of the provider manifest of the platform, if it has one.
   */
  readonly providerManifest?: string;
  /**
   * The fields of the project, e.g. `projectId`. Public identifiers, never
   * credentials.
   */
  readonly variables: Readonly<Record<string, string>>;
}

export interface FlagsManifest {
  readonly version: 1;
  /**
   * The connections, by an id which the definitions use.
   */
  readonly connections: Readonly<Record<string, FlagManifestConnection>>;
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
  readonly connection?: unknown;
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
 * The connection of a flag in the manifest. A flag without a connection uses
 * the default connection.
 */
function connectionOf(flag: ExportedFlag): FlagManifestConnection | undefined {
  const connection = (flag.connection ?? runtime.defaultConnection) as {
    project?: unknown;
  };
  const project = connection?.project as Record<string, unknown> | undefined;
  if (typeof project !== 'object' || project === null) return undefined;
  const { platform, providerManifest, ...fields } = project;
  if (typeof platform !== 'string') return undefined;
  const variables: Record<string, string> = {};
  // Vercel Flags: the project comes from the environment of the build
  if (platform === 'vercel') {
    for (const [name, value] of Object.entries(findVercelProject())) {
      if (value) variables[name] = value;
    }
  }
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'string') variables[name] = value;
  }
  const url =
    typeof providerManifest === 'string'
      ? providerManifest
      : providerManifestUrls[platform as keyof typeof providerManifestUrls];
  return {
    platform,
    ...(url ? { providerManifest: url } : {}),
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
      definition: Omit<FlagManifestDefinition, 'sources' | 'connection'>;
      connection: FlagManifestConnection | undefined;
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
      const connection = connectionOf(value);
      const source = { module: module.id, export: name };
      const existing = found.get(value.key);
      if (!existing) {
        found.set(value.key, { definition, connection, sources: [source] });
        continue;
      }
      if (
        stringify(existing.definition) !== stringify(definition) ||
        stringify(existing.connection ?? null) !== stringify(connection ?? null)
      ) {
        const first = existing.sources[0];
        throw new Error(
          `flags: Flag "${value.key}" is declared two times with different values: export "${first?.export}" of ${first?.module}, and export "${name}" of ${module.id}.`,
        );
      }
      existing.sources.push(source);
    }
  }

  // The ids of the connections: the platform, and a number if two
  // connections have the same platform. In the order of the keys of the
  // flags, so that the file is stable.
  const connections: Record<string, FlagManifestConnection> = {};
  const ids = new Map<string, string>();
  const entries = [...found.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const definitions = Object.fromEntries(
    entries.map(([key, { definition, connection, sources }]) => {
      let id: string | undefined;
      if (connection) {
        const content = stringify(connection);
        id = ids.get(content);
        if (!id) {
          id = connection.platform;
          for (let n = 2; Object.hasOwn(connections, id); n++) {
            id = `${connection.platform}-${n}`;
          }
          ids.set(content, id);
          connections[id] = connection;
        }
      }
      return [
        key,
        { ...definition, ...(id ? { connection: id } : {}), sources },
      ];
    }),
  );
  return { version: 1, connections, definitions };
}

export {
  expandTemplate,
  type FlagLinks,
  type ProviderManifest,
  type ProviderManifestLinks,
  resolveFlagLinks,
  validateProviderManifest,
} from './provider-manifest';
