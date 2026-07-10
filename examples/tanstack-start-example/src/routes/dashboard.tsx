import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { showNewDashboard } from '../flags';

// Flags are evaluated on the server, so we wrap the evaluation in a server
// function. This keeps it working during client-side navigation too — the
// loader calls the server function instead of evaluating the flag directly.
const getDashboardFlags = createServerFn().handler(async () => {
  return { showNewDashboard: await showNewDashboard() };
});

export const Route = createFileRoute('/dashboard')({
  loader: () => getDashboardFlags(),
  component: Dashboard,
});

function Dashboard() {
  const { showNewDashboard } = Route.useLoaderData();

  return (
    <main>
      <h1>Dashboard</h1>
      {showNewDashboard ? (
        <p>✨ You are seeing the new dashboard.</p>
      ) : (
        <p>You are seeing the old dashboard.</p>
      )}
      <p>
        Toggle it by setting a cookie, then reload:
        <br />
        <code>document.cookie = 'showNewDashboard=true'</code>
      </p>
    </main>
  );
}
