import { Content } from '@/components/content';
import Link from 'next/link';

export default function Page() {
  return (
    <Content crumbs={['philosophy']}>
      <h2>Philosophy</h2>
      <p>
        The Flags SDK encodes best practices and opinionated patterns around
        flag usage.
      </p>
      <p>At a glance, the philosophy is:</p>
      <ul>
        <li>flags are always used server-side</li>
        <li>flags do not accept arguments on the call-side</li>
        <li>flags declare their evaluation context</li>
        <li>flags delcare their default value</li>
      </ul>
      <p>
        Read more about this philosophy in the{' '}
        <Link href="/philosophy/flags-as-code">Flags as Code</Link> section.
      </p>
    </Content>
  );
}
