import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Flags SDK + TanStack Start' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 640,
          margin: '0 auto',
          padding: 24,
          lineHeight: 1.5,
        }}
      >
        <nav style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <Link to="/">Home</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/marketing">Marketing A/B</Link>
        </nav>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
