import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { hasUseFlagsDirective } from './directive';
import { FLAGS_FILE_EXTENSION } from './flags-file/document';
import { GENERATED_DIRECTORY } from './generated-directory';

const extensions = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
// Dependencies, output of builds, and hidden directories
const skipped = new Set(['node_modules', 'out', 'build', 'dist', 'coverage']);

/**
 * Calls `visit` for each file of the project, relative to the project and
 * with `/`. Skips dependencies, the output of builds, and hidden
 * directories other than `.flags`.
 */
function walk(projectDir: string, visit: (path: string, name: string) => void) {
  const visitDirectory = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const generated =
        dir === projectDir && entry.name === GENERATED_DIRECTORY;
      if (
        (entry.name.startsWith('.') && !generated) ||
        skipped.has(entry.name)
      ) {
        continue;
      }
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visitDirectory(path);
      } else if (entry.isFile()) {
        visit(path, entry.name);
      }
    }
  };
  visitDirectory(projectDir);
}

function relativeId(projectDir: string, path: string): string {
  return relative(projectDir, path).split(sep).join('/');
}

/**
 * Returns the paths of the files of the project whose name matches,
 * relative to the project and with `/`, in a fixed order.
 *
 * @internal
 */
export function findFiles(
  projectDir: string,
  matches: (name: string) => boolean,
): string[] {
  const found: string[] = [];
  walk(projectDir, (path, name) => {
    if (matches(name)) {
      found.push(relativeId(projectDir, path));
    }
  });
  return found.sort();
}

/**
 * Returns the paths of the flags files (`*.flags`) of the project, relative
 * to the project and with `/`, in a fixed order.
 */
export function findFlagsFiles(projectDir: string): string[] {
  return findFiles(projectDir, (name) => name.endsWith(FLAGS_FILE_EXTENSION));
}

/**
 * Returns the paths of the flags modules of the project, relative to the
 * project and with `/`, in a fixed order: the modules with the
 * `'use flags'` directive, and the flags files (`*.flags`). The generated
 * modules of `flags:<source>` in `.flags` are included, but no other hidden
 * directory.
 */
export function findFlagsModules(projectDir: string): string[] {
  const found: string[] = [];
  walk(projectDir, (path, name) => {
    if (name.endsWith(FLAGS_FILE_EXTENSION)) {
      found.push(relativeId(projectDir, path));
    } else if (
      extensions.test(name) &&
      !name.endsWith('.d.ts') &&
      !name.includes('.d.') &&
      hasUseFlagsDirective(readFileSync(path, 'utf8'))
    ) {
      found.push(relativeId(projectDir, path));
    }
  });
  return found.sort();
}
