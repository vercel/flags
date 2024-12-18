import { Content } from '@/components/content';
import { IframeBrowser } from '@/components/iframe-browser';

export default function Page() {
  return (
    <Content crumbs={['examples', 'marketing-pages']}>
      <h2>Marketing Pages</h2>
      <p>
        This example shows how to use feature flags for marketing pages.
        Dashboard pages are typically static, and served from the CDN at the
        edge.
      </p>
      <p>
        When A/B testing on marketing pages it&apos;s important to avoid layout
        shift and jank, and to keep the pages static. This example shows how to
        keep a page static and serveable from the CDN even when running multiple
        A/B tests on the page.
      </p>
      <h3>Example</h3>
      <p>
        The example below shows the usage of two feature flags on a static page.
        These flags represent two A/B tests which you could be running
        simulatenously.
      </p>
      <IframeBrowser
        src="http://localhost:3001/examples/marketing-pages"
        codeSrc=""
      />
    </Content>
  );
}
