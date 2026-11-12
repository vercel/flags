import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const dir = import.meta.dirname;
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');

// A production build, with the fetch of Next.js: app/page.js has
// `dynamic = 'error'`, so the build fails when encryptFlagValues makes the
// page dynamic.
it('builds a static page which encrypts flag values without FLAGS_SECRET', () => {
  rmSync(path.join(dir, '.next'), { recursive: true, force: true });

  const build = spawnSync(process.execPath, [next, 'build'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      // Answers the request for the public keys in each process of the build
      NODE_OPTIONS: `--import=${pathToFileURL(path.join(dir, 'key-host.mjs'))}`,
      FLAGS_SECRET: '',
      VERCEL_PROJECT_ID: 'prj_test',
      VERCEL_OIDC_TOKEN: '',
    },
  });
  expect(build.status, build.stdout + build.stderr).toBe(0);

  const manifest = JSON.parse(
    readFileSync(path.join(dir, '.next/prerender-manifest.json'), 'utf8'),
  );
  // Static, and not revalidated
  expect(manifest.routes['/']).toMatchObject({
    initialRevalidateSeconds: false,
  });

  const html = readFileSync(
    path.join(dir, '.next/server/app/index.html'),
    'utf8',
  );
  const token = html.match(/data-flag-values[^>]*>"([^"]+)"</)?.[1];
  expect(token).toBeDefined();
  // Encrypted with the public key, not with a secret
  const header = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString(),
  );
  expect(header).toMatchObject({
    alg: 'ECDH-ES',
    kid: 'test-key',
    projectIds: ['prj_test'],
  });
}, 120_000);
