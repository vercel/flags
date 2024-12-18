import { CodeBlock } from '@/components/code-block';
import { Content } from '@/components/content';
import { dedupe } from '@vercel/flags/next';
import Link from 'next/link';

const dedupeExample = dedupe(() => {
  return Math.random().toString().substring(0, 8);
});

export default async function Page() {
  const random1 = await dedupeExample();
  const random2 = await dedupeExample();
  const random3 = await dedupeExample();

  return (
    <Content crumbs={['concepts', 'dedupe']}>
      <h2>Dedupe</h2>
      <p>Prevent duplicate work.</p>
      <p>
        Any function wrapped in <code>dedupe</code> will only ever run once for
        the same request within the same runtime and given the same arguments.
      </p>
      <p>
        The <code>dedupe</code> function is an integral piece when working with
        the Flags SDK.{' '}
      </p>
      <h3>Example</h3>
      <CodeBlock>{`
        import { dedupe } from '@vercel/flags/next';

        const dedupeExample = dedupe(() => {
          return Math.random();
        });

        export default async function Page() {
          const random1 = await dedupeExample();
          const random2 = await dedupeExample();
          const random3 = await dedupeExample();

          // these will all be the same random number
          return <div>{random1} {random2} {random3}</div>;
        }
      `}</CodeBlock>
      <p>Example of output:</p>
      <div className="bg-slate-200 p-4 rounded monospace">
        {random1} {random2} {random3}
      </div>
      <h3>Use case: Avoiding duplicate work</h3>
      <p>
        This helper is extremly useful in combination with the{' '}
        <code>identify</code> function, as it allows the identification to only
        happen once per request. This is useful in preventing overhead when
        passing the same <code>identify</code> function to multiple feature
        flags.
      </p>
      <h3>Use case: Generating consistent random IDs</h3>
      <p>
        When experimenting on anonymous visitors it is common to set a cookie
        containing a random id from Edge Middleware. This random id is later
        used to consistently assign users to specific groups of A/B tests.
      </p>
      <p>
        For this use case the function generating the random id can be wrapped
        in <code>dedupe</code>. The deduplicated function is then called in Edge
        Middleware to produce the random id, and from a flag&apos;s{' '}
        <code>identify</code> function to identify the user even on the first
        page visit when no cookie is present yet.
      </p>
      <p>
        As the function is guaranteed to generate the same id the Edge
        Middleware can set a cookie containing the generated id in a response,
        and the feature flag can already use the generated id even if the
        original request did not contain the id.
      </p>
      <p>
        <Link href="/examples/marketing-pages">Learn more</Link> about this
        approach in the Marketing Pages example.
      </p>
    </Content>
  );
}
