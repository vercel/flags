import { Content } from '@/components/content';
import { DemoFlag } from '@/components/demo-flag';
import { basicEdgeMiddlewareFlag } from './flags';
import { Button } from '@/components/ui/button';
import { actAsFlaggedInUser, actAsFlaggedOutUser, clear } from './handlers';
import Link from 'next/link';
import { CodeBlock } from '@/components/code-block';
import { SelfDocumentingExampleAlert } from '@/components/self-documenting-example-alert';

// This component  does not actually use the feature flag, but the
// variant-on and variant-off pages know about the value statically.
export function Shared({ variant }: { variant: 'on' | 'off' }) {
  return (
    <Content crumbs={['examples', 'feature-flags-in-edge-middleware']}>
      <h2>Feature Flags in Edge Middleware</h2>
      <p>
        Shows how to use feature flags in Edge Middleware to serve different
        static variants of a page.
      </p>
      <h3>Example</h3>
      <p>
        This example works by using a feature flag in Edge Middleware to then
        rewrite the request to a different page. Rewriting the request means the
        user-facing URL shown in the browser stays the same, while different
        content is served for different visitors. As the underlying{' '}
        <code>variant-on</code> and <code>variant-off</code> pages are static,
        the Edge Network can serve these at the edge.
      </p>

      <CodeBlock>{`
      import { type NextRequest, NextResponse } from 'next/server';
      import { basicEdgeMiddlewareFlag } from './flags';


      export const config = {
        matcher: ['/examples/feature-flags-in-edge-middleware'],
      };

      export async function middleware(request: NextRequest) {
        const active = await basicEdgeMiddlewareFlag();
        const variant = active ? 'variant-on' : 'variant-off';

        return NextResponse.rewrite(
          new URL(
            \`/examples/feature-flags-in-edge-middleware/\${variant}\`,
            request.url,
          ),
        );
      }
      `}</CodeBlock>
      <div className="flex gap-2">
        <Button onClick={actAsFlaggedInUser} variant="outline">
          Act as a flagged in user
        </Button>
        <Button onClick={actAsFlaggedOutUser} variant="outline">
          Act as a flagged out user
        </Button>
        <Button onClick={clear} variant="outline">
          Clear cookie
        </Button>
      </div>
      <DemoFlag name={basicEdgeMiddlewareFlag.name} value={variant === 'on'} />
      <SelfDocumentingExampleAlert>
        <Link href="https://github.com/vercel/flags/blob/main/examples/docs/app/examples/feature-flags-in-edge-middleware/page.tsx">
          Inspect the source code
        </Link>{' '}
        to see the actual usage of the feature flag.
      </SelfDocumentingExampleAlert>

      <h3>Advanced examples</h3>
      <p>
        Using feature flags in Edge Middleware as shown in this example is very
        basic. This approach does not scale well when you have are using
        multiple feature flags on the same page or when you are using the same
        feature flag on multiple pages. We recommend using{' '}
        <Link href="/concepts/precompute">precompute</Link> for more advanced
        use cases, which solves these challenges.
      </p>
    </Content>
  );
}
