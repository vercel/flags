import { Content } from '@/components/content';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { CodeBlock } from '@/components/code-block';
import { IframeBrowser } from '@/components/iframe-browser';

export default function Page() {
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

      <IframeBrowser
        src="http://localhost:3001/examples/feature-flags-in-edge-middleware"
        codeSrc=""
      />

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
