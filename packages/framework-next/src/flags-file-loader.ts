/**
 * The loader of `withFlags` for Turbopack, for flags files (`*.flags`). It
 * compiles a flags file into a module with `defineSource` and
 * `source.bindFlag`, which registers its flags itself. See "Flags files"
 * in the spec of `flags`.
 *
 * It also writes the declaration file next to the flags file, e.g.
 * `app.d.flags.ts`, for the editors and for `tsc`.
 */
import { dirname } from 'node:path';
import {
  compileFlagsFile,
  sourceDirectoryCandidates,
  writeFlagsFileDeclaration,
} from 'flags/tooling';

interface LoaderContext {
  readonly resourcePath: string;
  getOptions(): { projectDir: string };
  addDependency(file: string): void;
  addContextDependency(directory: string): void;
  emitWarning(warning: Error): void;
}

export default function flagsFileLoader(
  this: LoaderContext,
  source: string,
): string {
  const { projectDir } = this.getOptions();
  const compiled = compileFlagsFile(source, {
    fileName: this.resourcePath,
    projectDirectory: projectDir,
  });
  // A new provider.ts or context.ts changes the module
  this.addDependency(`${projectDir}/package.json`);
  for (const { name } of compiled.sources) {
    for (const directory of sourceDirectoryCandidates(projectDir, name)) {
      this.addContextDependency(dirname(directory));
    }
  }
  for (const warning of compiled.warnings) {
    this.emitWarning(new Error(`flags: ${warning.message}`));
  }
  try {
    writeFlagsFileDeclaration(this.resourcePath, source, projectDir);
  } catch {
    // The types are a convenience, the module is what counts
  }
  return compiled.code;
}
