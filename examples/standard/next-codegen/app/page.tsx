import { 'hero-text' as heroText } from 'flags:marketing';
import { checkout, 'summer-sale' as summerSale } from 'flags:shop';
import { evaluate } from 'flags';

export default async function Page() {
  // The generated flags are flags like each other: evaluate, overrides,
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
