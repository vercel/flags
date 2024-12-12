import { CodeBlock } from '@/components/code-block';
import { Content } from '@/components/content';
import Image from 'next/image';
import Link from 'next/link';

export default function Page() {
  // This page should talk about the need to declare options upfront.
  return (
    <Content crumbs={['concepts', 'precompute']}>
      <h2>Precompute</h2>
      <p>Using feature flags on static pages.</p>
      <p>
        Precomputing describes a pattern where Edge Middleware uses feature
        flags to decide which variant of a page to show. This allows to keep the
        page itself static, which leads to incredibly low latency globally as
        the page can be served by an Edge Network.
      </p>
      <Image
        src="https://assets.vercel.com/image/upload/v1730448888/front/docs/feature-flags/Light_PNG-1.avif"
        width={1248}
        height={606}
        alt="Precompute manual"
      />
      <h3>Manual approach</h3>
      <p>
        In its most simple form this pattern is implemented creating two
        versions of the home page in <code>app/home-a/page.tsx</code> and{' '}
        <code>app/home-b/page.tsx</code>. Then, use Edge Middleare to rewrite
        the request either to <code>/home-a</code> or <code>/home-b</code>.
      </p>
      <CodeBlock>{`
      // flags.ts
      import { flag } from '@vercel/flags/next';
 
      export const homeFlag = flag({
        key: 'home',
        decide: () => Math.random() > 0.5,
      });
      `}</CodeBlock>

      <CodeBlock>{`
      // middleware.ts
      import { NextResponse, type NextRequest } from 'next/server';
      import { homeFlag } from './flags.ts';
      
      export const config = { matcher: ['/'] };
      
      export async function middleware(request: NextRequest) {
        const home = await homeFlag();
      
        // Determine which version to show based on the feature flag
        const version = home ? '/home-b' : '/home-a';
      
        // Rewrite the request to the appropriate version
        const nextUrl = new URL(version, request.url);
        return NextResponse.rewrite(nextUrl);
      }
      `}</CodeBlock>

      <p>
        This approach works well for simple cases, but has a few downsides. It
        can be cumbersome having to maintain both <code>/home-a</code> or{' '}
        <code>/home-b</code>. The approach also doesn&apos;t scale well when a
        feature flag is used on more than one page, or when multiple feature
        flags are used on a single page.
      </p>
      <h3>Precomputing</h3>
      <p>
        This is an extension to the previously described pattern. It allows
        combining multiple feature flags on a single, static page.
      </p>

      <p>
        This pattern is useful for experimentation on static pages, as it allows
        middleware to make routing decisions, while being able to keep the
        different variants of the underlying flags static.
      </p>

      <p>
        It further allows generating a page for each combination of feature
        flags either at build time or lazily the first time it is accessed. It
        can then be cached using ISR so it does not need to be regenerated.
      </p>

      <p>
        Technically this works by using dynamic route segments to transport an
        encoded version of the feature flags computed within Edge Middleware.
        Encoding the values within the URL allows the page itself to access the
        precomputed values, and also ensures there is a unique URL for each
        combination of feature flags on a page. Because the system works using
        rewrites, the visitor will never see the URL containing the flags. They
        will only see the clean, original URL.
      </p>

      <h4>Export flags to be precomputed</h4>
      <p>
        You can export one or multiple arrays of flags to be precomputed. This
        by itself does not do anything yet, but you will use the exported array
        in the next step:
      </p>

      <CodeBlock>{`
      // flags.ts
      import { flag } from '@vercel/flags/next';
 
      export const showSummerSale = flag({
        key: 'summer-sale',
        decide: () => false,
      });
      
      export const showBanner = flag({
        key: 'banner',
        decide: () => false,
      });
      
      // a group of feature flags to be precomputed
      export const marketingFlags = [showSummerSale, showBanner] as const;
      `}</CodeBlock>

      <h4>Precompute flags in middleware</h4>
      <p>
        In this step, import <code>marketingFlags</code> from the flags{' '}
        <code>file</code> that you created in the previous step. Then, call{' '}
        <code>precompute</code> with the list of flags to be precomputed.
        You&apos;ll then forward the precomputation result to the underlying
        page using an URL rewrite:
      </p>
      <CodeBlock>{`
      // middleware.ts
      import { type NextRequest, NextResponse } from 'next/server';
      import { precompute } from '@vercel/flags/next';
      import { marketingFlags } from './flags';
      
      // Note that we're running this middleware for / only, but
      // you could extend it to further pages you're experimenting on
      export const config = { matcher: ['/'] };
      
      export async function middleware(request: NextRequest) {
        // precompute returns a string encoding each flag's returned value
        const code = await precompute(marketingFlags);
      
        // rewrites the request to include the precomputed code for this flag combination
        const nextUrl = new URL(
          \`/\${code}\${request.nextUrl.pathname}\${request.nextUrl.search}\`,
          request.url,
        );
      
        return NextResponse.rewrite(nextUrl, { request });
      }
      `}</CodeBlock>

      <h4>Accessing the precomputation result from a page</h4>

      <p>
        Next, import the feature flags you created earlier, such as{' '}
        <code>showBanner</code>, while providing the code from the URL and the{' '}
        <code>marketingFlags</code> list of flags used in the precomputation.
      </p>
      <p>
        When the <code>showBanner</code> flag is called within this component it
        reads the result from the precomputation, and it does not invoke the
        flag&apos;s <code>decide</code> function again:
      </p>

      <CodeBlock>{`
      // app/[code]/page.tsx
      import { marketingFlags, showSummerSale, showBanner } from '../../flags';
      type Params = Promise<{ code: string }>;
      
      export default async function Page({ params }: { params: Params }) {
        const { code } = await params;
        // access the precomputed result by passing params.code and the group of
        // flags used during precomputation of this route segment
        const summerSale = await showSummerSale(code, marketingFlags);
        const banner = await showBanner(code, marketingFlags);
      
        return (
          <div>
            {banner ? <p>welcome</p> : null}
      
            {summerSale ? (
              <p>summer sale live now</p>
            ) : (
              <p>summer sale starting soon</p>
            )}
          </div>
        );
      }
      `}</CodeBlock>

      <p>
        This approach allows middleware to decide the value of feature flags and
        to pass the precomputation result down to the page. This approach also
        works with API Routes.
      </p>

      <h4>Enabling ISR (optional)</h4>
      <p>
        So far you&apos;ve set up middleware to decide the value of each feature
        flag to be precomputed and to pass the value down. In this step you can
        enable ISR to cache generated pages after their initial render:
      </p>

      <CodeBlock>{`
      // app/[code]/layout.tsx
      import type { ReactNode } from 'react';
      
      export async function generateStaticParams() {
        // returning an empty array is enough to enable ISR
        return [];
      }
      
      export default async function Layout({ children }: { children: ReactNode }) {
        return children;
      }
      `}</CodeBlock>

      <h4>Opting into build-time rendering (optional)</h4>

      <p>
        The <code>@vercel/flags/next</code> submodule exposes a helper function
        for generating pages for different combinations of flags at build time.
        This function is called <code>generatePermutations</code> and takes a
        list of flags and returns an array of strings representing each
        combination of flags:
      </p>
      <CodeBlock>{`
      // app/[code]/page.tsx
      import type { ReactNode } from 'react';
      import { generatePermutations } from '@vercel/flags/next';
      
      export async function generateStaticParams() {
        const codes = await generatePermutations(marketingFlags);
        return codes.map((code) => ({ code }));
      }
      
      export default function Page() { /* ... */}
      `}</CodeBlock>
      <p>
        You can further customize which specific combinations you want render by
        passing a filter function as the second argument of{' '}
        <code>generatePermutations</code>.
      </p>
      <h4>Example</h4>
      <p>
        See the <Link href="/examples/marketing-pages">Marketing Pages</Link>{' '}
        example which implements this pattern.
      </p>
    </Content>
  );
}
