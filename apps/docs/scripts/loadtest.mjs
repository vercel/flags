#!/usr/bin/env node
/**
 * Seeds experiment exposures by requesting the home page with many distinct
 * `userId` cookies. Each request makes `proxy.ts` precompute `rootFlags`,
 * which evaluates `experimentFlag` and reports an exposure for that user.
 *
 * Usage:
 *   node scripts/loadtest.mjs [--url http://localhost:3000/] [--users 200] [--concurrency 10] [--prefix loadtest]
 */
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    users: { type: 'string', default: '200' },
    concurrency: { type: 'string', default: '10' },
    prefix: { type: 'string', default: 'loadtest' },
  },
});

const url = values.url;
const users = Number(values.users);
const concurrency = Number(values.concurrency);
const runId = randomUUID().slice(0, 8);

const userIds = Array.from(
  { length: users },
  (_, i) => `${values.prefix}-${runId}-${i}`,
);

const stats = { ok: 0, failed: 0, statuses: {}, durations: [] };

async function hit(userId) {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      headers: {
        cookie: `userId=${encodeURIComponent(userId)}`,
        // A regular browser Accept header, so markdown negotiation doesn't
        // short-circuit the request before the flag is evaluated.
        accept: 'text/html,application/xhtml+xml',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      },
      redirect: 'manual',
    });
    await res.arrayBuffer();
    stats.statuses[res.status] = (stats.statuses[res.status] ?? 0) + 1;
    if (res.ok) stats.ok++;
    else stats.failed++;
  } catch (error) {
    stats.failed++;
    stats.statuses.error = (stats.statuses.error ?? 0) + 1;
    if (stats.statuses.error === 1) console.error(`Request failed: ${error.message}`);
  } finally {
    stats.durations.push(performance.now() - start);
  }
}

console.log(
  `Seeding ${users} users against ${url} (concurrency ${concurrency}, run ${runId})`,
);

const started = performance.now();
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, users) }, async () => {
    while (next < userIds.length) {
      await hit(userIds[next++]);
      const done = stats.ok + stats.failed;
      if (done % 50 === 0) console.log(`  ${done}/${users}`);
    }
  }),
);

const sorted = stats.durations.sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]?.toFixed(0);

console.log(`\nDone in ${((performance.now() - started) / 1000).toFixed(1)}s`);
console.log(`  ok: ${stats.ok}, failed: ${stats.failed}`);
console.log(`  statuses: ${JSON.stringify(stats.statuses)}`);
console.log(`  latency ms: p50=${pct(0.5)} p95=${pct(0.95)} max=${pct(1)}`);
