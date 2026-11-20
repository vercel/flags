import type { Project } from './source';

/**
 * One flag of a catalog.
 */
export interface CatalogFlag {
  /**
   * The values which the flag can have now. The code generation writes them
   * as the `options` of the flag, and takes the type of the flag from them.
   * The provider can return other values later, e.g. a variant which was
   * added after the deployment.
   */
  readonly variants: readonly unknown[];
  /**
   * What the flag is for. The code generation writes it as JSDoc and as the
   * `description` of the flag.
   */
  readonly description?: string;
  /**
   * The value which the flag returns when the evaluation fails, e.g. the
   * fallback variant of the system. The code generation writes it as the
   * `defaultValue` of the flag. Without it, a failing evaluation throws.
   */
  readonly defaultValue?: unknown;
}

/**
 * The flags of a source at one point in time, e.g. of the flag project in a
 * flag management system. The code generation uses it to write the module
 * of `flags:<source>`. The runtime does not use it.
 */
export interface Catalog {
  /**
   * The flag project, e.g. for the links of Flags Explorer. The code
   * generation writes it as the `project` of the source.
   */
  readonly project?: Project;
  /**
   * A number which changes with each change of the catalog, if the system
   * has one.
   */
  readonly revision?: number;
  readonly flags: Readonly<Record<string, CatalogFlag>>;
}

export interface CatalogLoadOptions {
  /**
   * Stop network requests and subscriptions when this signal is aborted.
   */
  readonly signal: AbortSignal;
}

/**
 * The default export of `flags/sources/<source>/catalog.ts`. It returns one
 * catalog, or yields a complete catalog first and again after each change.
 * It runs in Node.js at build time and in development, not in the
 * application.
 *
 * @example
 * ```ts
 * import type { CatalogLoader } from 'flags';
 *
 * const loadCatalog: CatalogLoader = async () => ({
 *   flags: { 'summer-sale': { variants: [false, true] } },
 * });
 * export default loadCatalog;
 * ```
 */
export type CatalogLoader = (
  options: CatalogLoadOptions,
) =>
  | Catalog
  | AsyncIterable<Catalog>
  | Promise<Catalog | AsyncIterable<Catalog>>;
