import PagesLayout from '@/components/pages-layout';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { exampleFlag } from '@/flags';
import { DemoFlag } from '@/components/demo-flag';

export const getServerSideProps = (async ({ req }) => {
  const example = await exampleFlag(req);
  return { props: { example } };
}) satisfies GetServerSideProps<{ example: boolean }>;

export default function PageRouter({
  example,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <PagesLayout>
      <DemoFlag name="example-flag" value={example} />
    </PagesLayout>
  );
}
