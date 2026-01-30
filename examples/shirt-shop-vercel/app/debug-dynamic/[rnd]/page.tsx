import { createClient } from '@vercel/flags-core';
import { Suspense } from 'react';

const client = createClient(process.env.FLAGS as string);

export const generateStaticParams = async () => {
  console.log('generateStaticParams');
  await client.initialize();
  console.log('generateStaticParams#postinit');
  const result = await client.evaluate('summer-sale');
  console.log('generateStaticParams#poseteval');
  return [{ rnd: result.value ? 'yes' : 'no' }];
};

async function Content() {
  console.log('client.initialize()#preinit');
  await client.initialize();
  console.log('client.initialize()#posteval');
  console.log('client.evaluate()#preeval');
  const result = await client.evaluate('summer-sale');
  console.log('client.evaluate()posteval');
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
