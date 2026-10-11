import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { hasUseFlagsDirective } from './directive';

const extensions = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
// Dependencies, output of builds, and hidden directories
const skipped = new Set(['node_modules', 'out', 'build', 'dist', 'coverage']);

/**
 * Returns the paths of the modules with the `'use flags'` directive in the
 * project, relative to the project and with `/`, in a fixed order.
 *
 * @internal
 */
export function findFlagsModules(projectDir: string): string[] {
  const found: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || skipped.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (
        entry.isFile() &&
        extensions.test(entry.name) &&
        !entry.name.endsWith('.d.ts') &&
        hasUseFlagsDirective(readFileSync(path, 'utf8'))
      ) {
        found.push(relative(projectDir, path).split(sep).join('/'));
      }
    }
  };
  visit(projectDir);
  return found.sort();
}
