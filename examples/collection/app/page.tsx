import { Content } from '@/components/content';
import { CodeBlock } from '@/components/code-block';
import Link from 'next/link';
import { IframeBrowser } from '@/components/iframe-browser';

export const dynamic = 'error';

export default function Page() {
  return (
    <Content crumbs={['getting-started', 'overview']}>
      <h3>Overview</h3>
      <p>The Flags SDK makes it easy to use feature flags in Next.js.</p>
      <ul>
        <li>Works with any flag provider, with built-in adapters for many</li>
        <li>App Router, Pages Router and Edge Middleware compatible</li>
        <li>Supports dynamic and static pages</li>
        <li>Implements best practices to avoid common pitfalls</li>
      </ul>
      <h4>Usage example</h4>
      <p>
        Declare a new feature flag using the <code>flag</code> function.
      </p>
      <CodeBlock>
        {`
        import { flag } from '@vercel/flags/next';

        export const randomFlag = flag({
          key: "random-flag",
          decide() {
            // this flag will be on for 50% of visitors
            return Math.random() > 0.5;
          }
        });`}
      </CodeBlock>
      <p>Use the flag by calling it like any other async function.</p>
      <CodeBlock>{`await randomFlag()`}</CodeBlock>
      <p>This demo flag is on for 50% of visitors.</p>
      <IframeBrowser
        src="https://localhost:3000/standalone/getting-started/overview"
        codeSrc="https://github.com"
      />
      <p>
        See the <Link href="/getting-started/quickstart">Quickstart</Link> for
        full setup instructions.
      </p>
      <h4>Introduction</h4>
      <p>
        This package provides a simple way to use feature flags in your Next.js
        applications. It can be used no matter if your application is hosted on
        Vercel or not. It works with App Router, Pages Router and Edge
        Middleware. It also works with any feature flag provider.
      </p>
      <p>
        This package encodes the best practices when using feature flags in
        Next.js. We also understand that you sometimes need to deviate from the
        golden path, and have examples for those cases as well.
      </p>
      <p>
        While this package is called <code>@vercel/flags</code> it does not
        require using Vercel. It is also not limited to feature flags, and can
        be used for experimentation, A/B testing and any other dynamic flagging
        of code.
      </p>
    </Content>
  );
}
