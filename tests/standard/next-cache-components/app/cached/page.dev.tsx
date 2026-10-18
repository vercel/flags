import { Suspense } from 'react';
import { summerSale } from '../../flags';

// Not allowed: a flag in a cache scope. The flag has a default value, but
// the evaluation must still fail.
async function cachedSale() {
  'use cache';
  return summerSale();
}

async function Sale() {
  return <p id="sale">{String(await cachedSale())}</p>;
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
