import { Content } from '@/components/content';
import Link from 'next/link';

export default function Page() {
  return (
    <Content crumbs={['philosophy', 'server-side-vs-client-side']}>
      <h3>Server-side vs Client-side</h3>
      <p>
        At Vercel we strongly believe feature flags should be used server-side.
      </p>
      <h4>Avoid layout shift and jank</h4>
      <p>
        When a feature flag is used on the client side, it can cause layout
        shifts and jank. The application needs to wait until the feature flags
        are bootstrapped over the network. In the meantime it has to take one of
        two bad choices.
      </p>
      <ul>
        <li>Show a loading spinner</li>
        <li>Speculatively show one version of the page</li>
      </ul>
      <p>
        But if the feature flag turns out to have a different value the page
        needs to be swapped out leading to jank.
      </p>
      <p>
        With server-side usage of feature flags this problem is avoided. The
        server will only send the version of the page that matches the feature
        flag. No layout shift or jank.
      </p>
      <h4>Keeping pages static</h4>
      <p>
        A big benefit of client-side usage of feature flags is that the page
        itself can stay fully static. Having static pages is great, as they can
        be served by the CDN around the world which has incredibly low latency
        globally.
      </p>
      <p>
        A common misconception is that server-side usage of feature flags means
        that the page can no longer be static. This is not the case. The Vercel
        Flags SDK comes with multiple patterns which allow keeping the page
        static without falling back to client-side usage.
      </p>
      <p>
        These patterns are made possible by using Edge Middleare. One or
        multiple feature flags can be evaluted in Edge Middleware, and the
        request can then be rewritten to serve a statically generated version of
        the page. This combines extremely well with Incremental Static
        Regeneration (ISR).
      </p>
      <p>
        <Link href="#">Learn more</Link> about keeping pages static.
      </p>
      <h4>Confidentiality</h4>
      <p>
        Using feature flags on the client typically means the name of the
        feature flag is sent to the client. Often times teams then fall back to
        using cryptic alias for their feature flags in order to avoid leaking
        features.
      </p>
      <h4>Code size</h4>
      <p>
        When feature flags are used server-side only the necessary code is sent
        to the client. In contrast, when using feature flags client-side it is
        common that both versions of the page are sent to the client, which
        leads to an increased bundle size.
      </p>
    </Content>
  );
}
