/**
 * The loader of `withFlags` for Turbopack, for flags files (`*.flags`). It
 * compiles a flags file into a module with `defineSource` and
 * `source.bindFlag`, which registers its flags itself. See "Flags files"
 * in the spec of `flags`.
 *
 * For TypeScript before 7.1, it also writes the declaration file next to
 * the flags file, e.g. `app.d.flags.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  compileFlagsFile,
  declarationFileOf,
  renderFlagsFileTypes,
  sourceDirectoryCandidates,
  usesContentMapper,
} from 'flags/tooling';

interface LoaderContext {
  readonly resourcePath: string;
  getOptions(): { projectDir: string };
  addDependency(file: string): void;
  addContextDependency(directory: string): void;
  emitWarning(warning: Error): void;
}

function writeDeclarations(file: string, text: string, projectDir: string) {
  if (usesContentMapper(projectDir)) {
    return;
  }
  const declaration = declarationFileOf(file);
  const types = renderFlagsFileTypes(text, {
    fileName: file,
    projectDirectory: projectDir,
  }).text;
  let previous: string | undefined;
  try {
    previous = readFileSync(declaration, 'utf8');
  } catch {
    previous = undefined;
  }
  if (previous !== types) {
    writeFileSync(declaration, types);
  }
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
  for (const directory of sourceDirectoryCandidates(
    projectDir,
    compiled.document.source,
  )) {
    this.addContextDependency(dirname(directory));
  }
  for (const warning of compiled.warnings) {
    this.emitWarning(new Error(`flags: ${warning.message}`));
  }
  try {
    writeDeclarations(this.resourcePath, source, projectDir);
  } catch {
    // The types are a convenience, the module is what counts
  }
  return compiled.code;
}
