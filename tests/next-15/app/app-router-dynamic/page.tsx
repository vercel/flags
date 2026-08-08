import { requestScopedFlag } from '../../flags';

/**
 * Nothing in this page reads the request except the flag itself, yet
 * `next build` reports the route as `ƒ (Dynamic)`. That is the SDK awaiting
 * `headers()` and `cookies()` before calling `decide` — no `await connection()`
 * needed here.
 */
export default async function Page() {
  const value = await requestScopedFlag();
  return <p data-testid="request-scoped-flag">Request scoped: {value}</p>;
}
