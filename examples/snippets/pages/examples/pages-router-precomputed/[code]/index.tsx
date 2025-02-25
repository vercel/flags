import PagesLayout from '@/components/pages-layout';
import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from 'next';
import {
  exampleFlag,
  exampleFlags,
} from '@/lib/pages-router-precomputed/flags';
import { DemoFlag } from '@/components/demo-flag';
import { generatePermutations } from 'flags/next';

export const getStaticPaths = (async () => {
  const codes = await generatePermutations(exampleFlags);

  return {
    paths: codes.map((code) => ({ params: { code } })),
    fallback: 'blocking',
  };
}) satisfies GetStaticPaths;

export const getStaticProps = (async (context) => {
  if (typeof context.params?.code !== 'string') return { notFound: true };

  const example = await exampleFlag(context.params.code, exampleFlags);
  return { props: { example } };
}) satisfies GetStaticProps<{ example: boolean }>;

export default function PageRouter({
  example,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <PagesLayout>
      <DemoFlag name="example-flag" value={example} />
    </PagesLayout>
  );
}
