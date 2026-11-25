import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

// Runs the build of `pnpm build` with Node.js, and requests it
const port = 4450;
const base = `http://localhost:${port}`;
let server: ChildProcess;

before(async () => {
  server = spawn('node', ['build/index.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(base);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error('The server did not start');
});

after(() => {
  server.kill();
});

async function flagsOfPage(cookie: string) {
  const html = await (await fetch(base, { headers: { cookie } })).text();
  const match = /<pre id="flags">(.*?)<\/pre>/.exec(html);
  assert.ok(match, 'the page has the flags');
  return JSON.parse((match[1] ?? '').replaceAll('&quot;', '"'));
}

test('evaluates the flag of src/app.flags with the request', async () => {
  assert.deepEqual(await flagsOfPage('user=alice'), { sale: true });
  assert.deepEqual(await flagsOfPage('user=bob'), { sale: false });
});
