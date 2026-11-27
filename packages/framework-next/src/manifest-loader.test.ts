import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifestLoader from './manifest-loader';

function project(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'flags-next-loader-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  return dir;
}

function run(projectDir: string, source: string) {
  const dependencies: string[] = [];
  const code = manifestLoader.call(
    {
      resourcePath: join(
        projectDir,
        'node_modules/@flags-sdk/next/dist/manifest.js',
      ),
      getOptions: () => ({ projectDir }),
      addContextDependency: (dir) => dependencies.push(dir),
    },
    source,
  );
  return { code, dependencies };
}

describe('manifestLoader', () => {
  it('imports each module with the directive', () => {
    const dir = project({
      'flags.ts': "'use flags';\nexport {};",
      'src/lib/more-flags.ts': "'use flags';\nexport {};",
      'src/page.tsx': 'export default function Page() {}',
    });

    const { code, dependencies } = run(
      dir,
      'const modules = /* flags:use-flags-modules */ [];',
    );

    expect(code).toBe(
      'const modules = [' +
        '{ id: "flags.ts", load: () => import("../../../../flags.ts") }, ' +
        '{ id: "src/lib/more-flags.ts", load: () => import("../../../../src/lib/more-flags.ts") }];',
    );
    // A new flags module in next dev runs the loader again
    expect(dependencies).toEqual([dir]);
  });

  it('keeps a module without the marker', () => {
    const dir = project({ 'flags.ts': "'use flags';" });

    expect(run(dir, 'const modules = [];').code).toBe('const modules = [];');
  });
});
