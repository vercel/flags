import { Suspense } from 'react';
import { summerSale } from '../flags';

// No connection() in the application: the binding waits for it
async function Sale() {
  return <p id="sale">{String(await summerSale())}</p>;
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading</p>}>
        <Sale />
      </Suspense>
    </main>
  );
}
