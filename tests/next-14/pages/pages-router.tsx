import type { InferGetServerSidePropsType, GetServerSideProps } from 'next';
import { exampleFlag, hostFlag, cookieFlag } from '../flags';

export const getServerSideProps = (async ({ req }) => {
  const example = await exampleFlag(req);
  const host = await hostFlag(req);
  const cookie = await cookieFlag(req);
  return { props: { example, host, cookie } };
}) satisfies GetServerSideProps<{
  example: boolean;
  host: string;
  cookie: string;
}>;

export default function PagesRouter({
  example,
  host,
  cookie,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div>
      <p>Example Pages Router Flag Value: {example ? 'true' : 'false'}</p>
      <p>Host: {host}</p>
      <p>Cookie: {cookie}</p>
    </div>
  );
}
