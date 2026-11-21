/**
 * The types of flags files for TypeScript before 7.1: a declaration file
 * next to each flags file, e.g. `app.d.flags.ts` for `app.flags`. With
 * `allowArbitraryExtensions`, TypeScript takes the types of
 * `import … from './app.flags'` from it.
 *
 * With the content mapper of TypeScript 7.1 (`contentMappers` in
 * `tsconfig.json`), TypeScript reads the flags files itself, and there are
 * no declaration files.
 */
import { randomUUID } from 'node:crypto';
import { type FSWatcher, readFileSync, watch } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { findFiles, findFlagsFiles } from '../find-flags-modules';
import { formatDiagnostics, renderFlagsFileTypes } from './compile';
import { FLAGS_FILE_EXTENSION } from './document';

const DECLARATION_SUFFIX = `.d${FLAGS_FILE_EXTENSION}.ts`;

/**
 * The declaration file of a flags file, e.g. `app.d.flags.ts` for
 * `app.flags`.
 */
export function declarationFileOf(file: string): string {
  return `${file.slice(0, -FLAGS_FILE_EXTENSION.length)}${DECLARATION_SUFFIX}`;
}

function isOwnDeclaration(content: string): boolean {
  return /^\/\/ The types of .*, by the Flags SDK\./.test(content);
}

/**
 * Whether the `tsconfig.json` of the project uses the content mapper of
 * `flags`, so that TypeScript needs no declaration files.
 */
export function usesContentMapper(projectDirectory: string): boolean {
  let text: string;
  try {
    text = readFileSync(path.join(projectDirectory, 'tsconfig.json'), 'utf8');
  } catch {
    return false;
  }
  return /"contentMappers"/.test(text) && /"\.flags"/.test(text);
}

async function writeIfChanged(file: string, content: string): Promise<boolean> {
  const previous = await readFile(file, 'utf8').catch(() => null);
  if (previous === content) {
    return false;
  }
  // An editor must never see half a file
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return true;
}

export interface FlagsFileDeclarationsResult {
  /** The flags files, relative to the project */
  readonly files: readonly string[];
  /** The errors and warnings of the flags files, as text */
  readonly problems: readonly string[];
}

/**
 * Writes the declaration file of each flags file of the project, if it
 * changed, and removes the declaration files of removed flags files. With
 * the content mapper, it removes them all. A flags file with an error still
 * gets its declarations, without the flags with errors.
 */
export async function writeFlagsFileDeclarations(
  projectDirectory: string,
): Promise<FlagsFileDeclarationsResult> {
  const root = path.resolve(projectDirectory);
  const files = findFlagsFiles(root);
  const mapper = usesContentMapper(root);
  const problems: string[] = [];
  const wanted = new Set<string>();
  for (const id of files) {
    const file = path.join(root, id);
    const text = await readFile(file, 'utf8');
    const types = renderFlagsFileTypes(text, {
      fileName: file,
      projectDirectory: root,
    });
    if (types.diagnostics.length > 0) {
      problems.push(formatDiagnostics(id, text, types.diagnostics));
    }
    if (!mapper) {
      const declaration = declarationFileOf(file);
      wanted.add(declaration);
      await writeIfChanged(declaration, types.text);
    }
  }
  for (const id of findFiles(root, (name) =>
    name.endsWith(DECLARATION_SUFFIX),
  )) {
    const file = path.join(root, id);
    if (wanted.has(file)) {
      continue;
    }
    const content = await readFile(file, 'utf8').catch(() => '');
    if (isOwnDeclaration(content)) {
      await rm(file, { force: true });
    }
  }
  return { files, problems };
}

/**
 * Writes the declarations again after each change of a flags file or of a
 * source, until the signal aborts. It watches the directory of the project
 * and each directory with a flags file, so a flags file in a new directory
 * needs a restart.
 */
export function watchFlagsFileDeclarations(
  projectDirectory: string,
  signal: AbortSignal,
  onProblems: (problems: readonly string[]) => void = (problems) => {
    for (const problem of problems) {
      console.error(problem);
    }
  },
): void {
  const root = path.resolve(projectDirectory);
  const directories = new Set([
    root,
    ...findFlagsFiles(root).map((id) => path.dirname(path.join(root, id))),
    path.join(root, 'flags', 'sources'),
    path.join(root, 'src', 'flags', 'sources'),
  ]);
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = Promise.resolve();
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running
        .then(() => writeFlagsFileDeclarations(root))
        .then(({ problems }) => {
          if (problems.length > 0) {
            onProblems(problems);
          }
        })
        .catch((error: unknown) => {
          console.error(
            'flags: Could not write the types of the flags files.',
            error,
          );
        });
    }, 50);
  };
  for (const directory of directories) {
    try {
      const watcher = watch(directory, { signal }, (_event, name) => {
        if (
          name === null ||
          name.endsWith(FLAGS_FILE_EXTENSION) ||
          directory.endsWith(`${path.sep}sources`) ||
          name === 'package.json'
        ) {
          schedule();
        }
      });
      watcher.on('error', () => {});
      watchers.push(watcher);
    } catch {
      // The directory does not exist
    }
  }
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    for (const watcher of watchers) {
      watcher.close();
    }
  });
}
