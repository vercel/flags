import { evaluate } from 'flags';
import { checkout, summerSale } from '../app.flags';
import { heroText } from './marketing.flags';

export default async function Page() {
  // The flags of flags files are flags like each other: evaluate, overrides,
  // hooks and the cache of the request apply
  const [sale, flow, hero] = await evaluate([summerSale, checkout, heroText]);
  return (
    <main>
      <h1>{hero}</h1>
      {sale ? <p>Summer sale!</p> : null}
      <p>Checkout: {flow}</p>
      <pre id="flags">{JSON.stringify({ sale, flow, hero })}</pre>
    </main>
  );
}
