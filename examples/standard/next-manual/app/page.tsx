import { evaluate } from 'flags';
import { betaBanner, checkout, summerSale } from '../flags';

export default async function Page() {
  // The flags know the request of the page through withFlags
  const [sale, flow, beta] = await evaluate([summerSale, checkout, betaBanner]);
  return (
    <main>
      {beta ? <p>You see the beta.</p> : null}
      {sale ? <h1>Summer sale!</h1> : <h1>Welcome</h1>}
      <p>Checkout: {flow}</p>
      <pre id="flags">{JSON.stringify({ sale, flow, beta })}</pre>
    </main>
  );
}
