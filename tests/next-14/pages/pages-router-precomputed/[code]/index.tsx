import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from 'next';
import { generatePermutations } from '@vercel/flags/next';
import {
  exampleFlag,
  hostFlag,
  cookieFlag,
  precomputedFlags,
} from '../../../flags';

export const getStaticPaths = (async () => {
  const codes = await generatePermutations(precomputedFlags);

  return {
    paths: codes.map((code) => ({ params: { code } })),
    fallback: 'blocking',
  };
}) satisfies GetStaticPaths;

export const getStaticProps = (async (context) => {
  if (typeof context.params?.code !== 'string') return { notFound: true };

  const example = await exampleFlag(context.params.code, precomputedFlags);
  const host = await hostFlag(context.params.code, precomputedFlags);
  const cookie = await cookieFlag(context.params.code, precomputedFlags);

  return { props: { example, host, cookie } };
}) satisfies GetStaticProps<{ example: boolean; host: string; cookie: string }>;

export default function Page({
  example,
  cookie,
  host,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div>
      <p>Pages Router Precomputed Example: {example ? 'true' : 'false'}</p>
      <p>Pages Router Precomputed Cookie: {cookie}</p>
      <p>Pages Router Precomputed Host: {host}</p>
    </div>
  );
}
