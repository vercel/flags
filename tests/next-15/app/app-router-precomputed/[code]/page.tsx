import { exampleFlag, hostFlag, cookieFlag, precomputedFlags } from '@/flags';

export const generateStaticParams = () => {
  return [];
};

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
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
