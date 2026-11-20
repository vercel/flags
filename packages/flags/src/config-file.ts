import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSettings, type Settings } from './settings';

const codeExtensions = ['ts', 'mts', 'js', 'mjs'];

/**
 * The files of the configuration in the folder `flags`, by the module which
 * a framework plugin replaces with each of them.
 */
const configModules = {
  'flags/hooks': codeExtensions.map((extension) => `hooks.${extension}`),
  'flags/settings': ['config.json'],
} as const;

/**
 * The modules which the framework plugins replace with the files of the
 * configuration.
 */
export type ConfigModule = keyof typeof configModules;

/**
 * The folders `flags` in which the SDK looks: in the directory of the
 * application, then in its `src` directory.
 */
function flagsFolders(dir: string): string[] {
  return [join(dir, 'flags'), join(dir, 'src', 'flags')];
}

/**
 * Finds the files of the configuration: `flags/hooks.ts` and
 * `flags/config.json`, in the directory of the
 * application or in its `src` directory. Returns the path of each file which
 * exists, by the module which the framework plugin replaces with it.
 */
export function findConfigModules(
  dir: string,
): Partial<Record<ConfigModule, string>> {
  const found: Partial<Record<ConfigModule, string>> = {};
  for (const [module, names] of Object.entries(configModules) as [
    ConfigModule,
    readonly string[],
  ][]) {
    for (const folder of flagsFolders(dir)) {
      const file = names
        .map((name) => join(folder, name))
        .find((candidate) => existsSync(candidate));
      if (file) {
        found[module] = file;
        break;
      }
    }
  }
  return found;
}

/**
 * Reads the static settings of `flags/config.json`, in the directory of the
 * application or in its `src` directory. Without the file, the settings are
 * the defaults. An invalid file throws.
 */
export function readSettings(dir: string): Settings {
  const file = findConfigModules(dir)['flags/settings'];
  if (file === undefined) {
    return {};
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new Error(`flags: ${file} is not valid JSON.`, { cause });
  }
  return parseSettings(value, file);
}
