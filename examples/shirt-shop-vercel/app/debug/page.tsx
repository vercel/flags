import { createClient } from '@vercel/flags-core';
import { Suspense } from 'react';

const client = createClient(process.env.FLAGS as string);

async function Content() {
  await client.initialize();
  console.log('client.initialize()');
  const result = await client.evaluate('summer-sale');
  console.log('client.evaluate()');
  // const result2 = await client.evaluate('summer-sale2');
  // await client.ensureFallback();
  return <p>summer-sale {JSON.stringify([result], null, 2)}</p>;
}

export default async function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content />
    </Suspense>
  );
}
