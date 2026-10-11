import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { evaluate } from 'flags';
import { darkMode, greeting } from '../default-flags';

// No middleware: the binding gets the request from getRequest()
const getConfigFlags = createServerFn({ method: 'GET' }).handler(async () => {
  const [dark, text] = await evaluate([darkMode, greeting]);
  return { dark, text };
});

export const Route = createFileRoute('/config')({
  loader: () => getConfigFlags(),
  component: Config,
});

function Config() {
  return <pre id="config">{JSON.stringify(Route.useLoaderData())}</pre>;
}
