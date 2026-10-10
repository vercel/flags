import { evaluate } from 'flags';
import { bannerText, newCheckout, summerSale } from '../flags';

// A server component which evaluates a flag again, in the same request
async function Checkout() {
  return <p id="checkout">{String(await newCheckout())}</p>;
}

export default async function Page() {
  const [sale, checkout, banner] = await evaluate([
    summerSale,
    newCheckout,
    bannerText,
  ]);
  return (
    <main>
      <pre id="flags">{JSON.stringify({ sale, checkout, banner })}</pre>
      <Checkout />
    </main>
  );
}
