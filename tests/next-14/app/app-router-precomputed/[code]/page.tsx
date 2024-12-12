import { exampleFlag, hostFlag, cookieFlag, precomputedFlags } from '@/flags';

export const generateStaticParams = () => {
  return [];
};

export default async function Page({ params }: { params: { code: string } }) {
  const example = await exampleFlag(params.code, precomputedFlags);
  const host = await hostFlag(params.code, precomputedFlags);
  const cookie = await cookieFlag(params.code, precomputedFlags);
  return (
    <div>
      <h1>Example App Router Flag Value: {example ? 'true' : 'false'}</h1>
      <p>Host: {host}</p>
      <p>Cookie: {cookie}</p>
    </div>
  );
}
