import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { cookieFlag, exampleFlag, hostFlag, precomputedFlags } from '@/flags';

const PLACEHOLDER = '__placeholder__';

export const generateStaticParams = () => {
  return [{ code: PLACEHOLDER }];
};

async function Home({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (code === PLACEHOLDER) return notFound();

  const example = await exampleFlag(code, precomputedFlags);
  const host = await hostFlag(code, precomputedFlags);
  const cookie = await cookieFlag(code, precomputedFlags);
  return (
    <div>
      <h1>Example App Router Flag Value: {example ? 'true' : 'false'}</h1>
      <p>Host: {host}</p>
      <p>Cookie: {cookie}</p>
    </div>
  );
}

export default function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense>
      <Home params={params} />
    </Suspense>
  );
}
