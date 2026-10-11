import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFlagsModules } from './find-flags-modules';

function project(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'flags-scan-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  return dir;
}

describe('findFlagsModules', () => {
  it('finds the modules with the directive, in a fixed order', () => {
    const dir = project({
      'flags.ts': "'use flags';\nexport const a = 1;",
      'src/lib/more-flags.mjs': '"use flags";',
      'src/page.tsx': 'export default function Page() {}',
      'src/strings.ts': "export const text = 'use flags';",
    });

    expect(findFlagsModules(dir)).toEqual([
      'flags.ts',
      'src/lib/more-flags.mjs',
    ]);
  });

  it('skips dependencies, the output of builds, and hidden directories', () => {
    const dir = project({
      'node_modules/pkg/flags.js': "'use flags';",
      'dist/flags.js': "'use flags';",
      '.next/server/flags.js': "'use flags';",
      'types.d.ts': "'use flags';",
    });

    expect(findFlagsModules(dir)).toEqual([]);
  });
});
