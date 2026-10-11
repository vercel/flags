import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { evaluate } from 'flags';
import { bannerText, newCheckout } from '../flags';

// Flags run only on the server, so the loader calls a server function
const getFlags = createServerFn({ method: 'GET' }).handler(async () => {
  const [checkout, banner] = await evaluate([newCheckout, bannerText]);
  return { checkout, banner };
});

export const Route = createFileRoute('/')({
  loader: () => getFlags(),
  component: Home,
});

function Home() {
  const flags = Route.useLoaderData();
  return <pre id="flags">{JSON.stringify(flags)}</pre>;
}
