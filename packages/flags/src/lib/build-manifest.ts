import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * The file of the manifest in the output of a build.
 */
export const MANIFEST_FILE = 'flags-manifest.json';

// Imports the built modules, and writes the manifest. `flags/manifest` is
// resolved from the project, which is the working directory. It exits when
// the file is written: a module can open a connection when it loads, and
// the open connection must not keep the build waiting.
const script = `
import { writeFileSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createManifest } from 'flags/manifest';
const [plan, output] = process.argv.slice(1);
try {
  const modules = [];
  for (const { id, file } of JSON.parse(plan)) {
    modules.push({ id, exports: { ...(await import(pathToFileURL(file).href)) } });
  }
  writeFileSync(output, JSON.stringify(createManifest(modules), null, 2));
  process.exit(0);
} catch (error) {
  // Synchronous, so that exit does not cut off the message
  writeSync(2, String((error && error.stack) || error) + '\\n');
  process.exit(1);
}
`;

/**
 * Writes the manifest from the built modules with `'use flags'`. In a
 * separate process, so that the modules do not run in the process of the
 * build, and so that each build imports them again.
 */
export async function writeManifestFromBuild(options: {
  readonly projectDir: string;
  readonly modules: readonly { id: string; file: string }[];
  readonly output: string;
}): Promise<void> {
  await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      script,
      JSON.stringify(options.modules),
      options.output,
    ],
    { cwd: options.projectDir, timeout: 60_000 },
  ).catch((error: { stderr?: string }) => {
    throw new Error(
      `flags: Could not write ${MANIFEST_FILE}. ${error.stderr || String(error)}`,
    );
  });
}
