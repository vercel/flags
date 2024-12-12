import { Content } from '@/components/content';

export default function Page() {
  return (
    <Content crumbs={['philosophy']}>
      <h2>Philosophy</h2>
      <p>
        We believe the best way to use feature flags is to use them server-side.
        Using feature flags server-side prevents common problems that come with
        client-side usage, like layout shift or flashing the wrong content.
      </p>
      <p>
        This approach fits extremely well with the App Router in Next.js. With
        React Server Components, there is always a way to load feature flags on
        the server.
      </p>
    </Content>
  );
}
