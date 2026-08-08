import { Suspense } from 'react';
import { requestScopedFlag } from '../../flags';

/**
 * With Cache Components enabled, `next build` fails this page with
 * `next-prerender-random` if the `Math.random()` inside the flag's `decide`
 * runs before any Request data (`cookies()`, `headers()`, `connection()`, …)
 * was accessed. The build succeeding is therefore itself an assertion that the
 * SDK reads the request before deciding — no `await connection()` needed here.
 */
async function RequestScoped() {
  const value = await requestScopedFlag();
  return <p data-testid="request-scoped-flag">Request scoped: {value}</p>;
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <RequestScoped />
    </Suspense>
  );
}
