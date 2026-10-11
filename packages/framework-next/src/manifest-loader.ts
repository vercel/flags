/**
 * The loader of `withFlags` for the module `@flags-sdk/next/manifest`. It puts an
 * import of each module with the `'use flags'` directive into the module, so
 * that the bundler of Next.js compiles them.
 */
import { dirname, join, relative, sep } from 'node:path';
import { findFlagsModules } from 'flags/tooling';

interface LoaderContext {
  readonly resourcePath: string;
  getOptions(): { projectDir: string };
  addContextDependency(directory: string): void;
}

// The build of the SDK keeps the comment, but can change the whitespace
const marker = /\/\*\s*flags:use-flags-modules\s*\*\/\s*\[\]/;

export default function manifestLoader(
  this: LoaderContext,
  source: string,
): string {
  if (!marker.test(source)) return source;
  const { projectDir } = this.getOptions();
  // The bundler runs the loader again when a file of the project changes,
  // e.g. a new module with 'use flags' in next dev
  this.addContextDependency(projectDir);
  const from = dirname(this.resourcePath);
  const imports = findFlagsModules(projectDir).map((id) => {
    let path = relative(from, join(projectDir, id)).split(sep).join('/');
    if (!path.startsWith('.')) path = `./${path}`;
    return `{ id: ${JSON.stringify(id)}, load: () => import(${JSON.stringify(path)}) }`;
  });
  return source.replace(marker, `[${imports.join(', ')}]`);
}
