/**
 * Functions for framework packages and build tools, e.g. `@flags-sdk/next`
 * and `@flags-sdk/vite`. Applications do not use them.
 *
 * They are a public contract: a framework which provides the binding of the
 * Flags SDK itself uses them in the same way.
 */
export { MANIFEST_FILE, writeManifestFromBuild } from './build-manifest';
export { renderSourceModule, type SourceFiles } from './codegen';
export {
  type ConfigModule,
  findConfigModules,
  readSettings,
} from './config-file';
export { hasUseFlagsDirective } from './directive';
export { findFlagsFiles, findFlagsModules } from './find-flags-modules';
export {
  type CompiledFlagsFile,
  type CompileOptions,
  compileFlagsFile,
  FlagsFileError,
  type FlagsFileSource,
  type FlagsFileTypes,
  findProjectDirectory,
  formatDiagnostics,
  renderFlagsFileTypes,
  resolveFlagsSource,
  sourceDirectoryCandidates,
  type TypesMapping,
} from './flags-file/compile';
export {
  declarationFileOf,
  type FlagsFileDeclarationsResult,
  usesContentMapper,
  watchFlagsFileDeclarations,
  writeFlagsFileDeclarations,
} from './flags-file/declarations';
export {
  DiagnosticCode,
  exportNameOf,
  FLAGS_FILE_EXTENSION,
  type FlagsFileDiagnostic,
  type FlagsFileDocument,
  type FlagsFileFlag,
  type FlagsFileOption,
  parseFlagsFile,
  type Span,
} from './flags-file/document';
export {
  type FlagsAliases,
  findFlagsDirectory,
  findGeneratedDeclarations,
  GENERATED_DECLARATIONS,
  GENERATED_DIRECTORY,
  generateFlags,
  type WatchResult,
  watchFlags,
} from './generate';
export { addSelfRegistration } from './self-registration';
export { optionIndex } from './value-types';

import type { SetupFramework } from './framework';
import { sharedState } from './shared-state';

/**
 * Registers the framework binding directly, instead of the alias of
 * `flags/framework`. For a framework which loads the SDK from
 * `node_modules`, so that no alias reaches it, e.g. Nitro in development.
 * Call it at startup, before the first evaluation. The first binding wins,
 * as with the alias.
 */
export function registerFramework(setup: SetupFramework): void {
  sharedState.setupFramework ??= setup;
}
