import { Content } from '@/components/content';

export default function Page() {
  return (
    <Content crumbs={['getting-started', 'overview']}>
      <h3>Overview</h3>
      <p>The feature flags SDK by Vercel for Next.js.</p>
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
      <h4>Rendering strategies</h4>
      <p>
        In Next.js, there are several ways to render a page. This SDK works with
        all of them, no matter if you are using server-side rendering, static
        site generation, partial prerendering or Edge Middleware.
      </p>
      <h4>Feature Flag Providers</h4>
      <p>
        The Flags SDK works with any feature flag provider. We offer adapters
        for commonly used providers, but it is also possible to write a custom
        adapter in case you have an in-house solution for feature flags.
      </p>
    </Content>
  );
}
