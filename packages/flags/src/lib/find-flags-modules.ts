import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { hasUseFlagsDirective } from './directive';

const extensions = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
// Dependencies and the output of builds
const skipped = new Set(['node_modules', 'out', 'build', 'dist', 'coverage']);

/**
 * Returns the paths of the modules of the project with the `'use flags'`
 * directive, relative to the project and with `/`, in a fixed order. Skips
 * dependencies, the output of builds, hidden directories, and declaration
 * files.
 *
 * It is a scan of the files, so it also finds the flags modules which no
 * route imports.
 */
export function findFlagsModules(projectDir: string): string[] {
  const found: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || skipped.has(entry.name)) {
        continue;
      }
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (
        entry.isFile() &&
        extensions.test(entry.name) &&
        !entry.name.includes('.d.') &&
        hasUseFlagsDirective(readFileSync(path, 'utf8'))
      ) {
        found.push(relative(projectDir, path).split(sep).join('/'));
      }
    }
  };
  visit(projectDir);
  return found.sort();
}
