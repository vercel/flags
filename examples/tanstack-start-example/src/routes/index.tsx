import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <main>
      <h1>Flags SDK + TanStack Start</h1>
      <p>
        This example shows how to use <code>flags/tanstack-start</code> in a
        TanStack Start app.
      </p>
      <ul>
        <li>
          <Link to="/dashboard">Dashboard</Link> — a boolean flag evaluated in a
          route loader via a server function.
        </li>
        <li>
          <Link to="/marketing">Marketing A/B</Link> — precomputed flags encoded
          into the URL.
        </li>
        <li>
          <a href="/.well-known/vercel/flags">/.well-known/vercel/flags</a> —
          the flags discovery endpoint (returns 401 without a valid
          Authorization header).
        </li>
      </ul>
    </main>
  );
}
