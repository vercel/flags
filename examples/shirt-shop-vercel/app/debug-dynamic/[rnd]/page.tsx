import { createClient } from '@vercel/flags-core';
import { Suspense } from 'react';

const client = createClient(process.env.FLAGS as string);

export const generateStaticParams = async () => {
  await client.initialize();
  const result = await client.evaluate('summer-sale');
  return [{ rnd: result.value ? 'yes' : 'no' }];
};

async function Content() {
  await client.initialize();
  console.log('client.initialize()');
  console.log('client.evaluate()');
  const result = await client.evaluate('summer-sale');
  // await client.ensureFallback();
  return <p>summer-sale {JSON.stringify(result, null, 2)}</p>;
}

export default async function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content />
    </Suspense>
  );
}
