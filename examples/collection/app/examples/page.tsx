import { Content } from '@/components/content';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function ExamplesPage() {
  return (
    <Content crumbs={['examples']}>
      <h2>Examples</h2>
      <p>This section shows common use cases for feature flags.</p>
      <div className="grid grid-cols-1 gap-4">
        <Link href="/examples/dashboard-pages" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Dashboard Pages</CardTitle>
            </CardHeader>
            <CardContent>Using feature flags on dynamic pages.</CardContent>
          </Card>
        </Link>
        <Link href="/examples/marketing-pages" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Marketing Pages</CardTitle>
            </CardHeader>
            <CardContent>Using feature flags on static pages.</CardContent>
          </Card>
        </Link>
        <h3>Concept examples</h3>
        <p>
          These concept pages are self-documenting examples. Each of these pages
          is built using the concept it describes, so you can inspect the source
          code to see how they work.
        </p>
        <Link href="/concepts/identify" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Identify</CardTitle>
            </CardHeader>
            <CardContent>Using evaluation contexts.</CardContent>
          </Card>
        </Link>
        <Link href="/concepts/dedupe" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Dedupe</CardTitle>
            </CardHeader>
            <CardContent>Avoiding redundant work.</CardContent>
          </Card>
        </Link>
        <Link href="/concepts/precompute" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Precompute</CardTitle>
            </CardHeader>
            <CardContent>Using feature flags on static pages.</CardContent>
          </Card>
        </Link>
        <Link href="/concepts/adapters" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Adapters</CardTitle>
            </CardHeader>
            <CardContent>
              Integrate any flag provider, or even your custom setup.
            </CardContent>
          </Card>
        </Link>
        <h3>More examples</h3>
        <Link
          href="/examples/feature-flags-in-edge-middleware"
          className="no-underline"
        >
          <Card>
            <CardHeader>
              <CardTitle>Using feature flags in Edge Middleware</CardTitle>
            </CardHeader>
            <CardContent>
              Shows how to use feature flags with a static page at the edge.
            </CardContent>
          </Card>
        </Link>
        {/* <Link href="/examples/consent-management" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Consent Management</CardTitle>
              <CardDescription>Get GDPR compliant</CardDescription>
            </CardHeader>
            <CardContent>To be GDRP compliant...</CardContent>
          </Card>
        </Link>
        <Link
          href="/examples/dashboard-vs-auth-buttons"
          className="no-underline"
        >
          <Card>
            <CardHeader>
              <CardTitle>Dashboard vs Auth Buttons</CardTitle>
              <CardDescription>
                Landing pages without layout shift
              </CardDescription>
            </CardHeader>
            <CardContent>
              Shows how to create a landing page which either contains a{' '}
              <i>Dashboard</i> button or <i>Sign Up</i> and <i>Sign In</i>{' '}
              buttons.
            </CardContent>
          </Card>
        </Link>
        <Link href="/examples/edge-config" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Edge Config</CardTitle>
              <CardDescription>Ultra-low latency</CardDescription>
            </CardHeader>
            <CardContent>
              Shows feature flags backed by Edge Config, without any third-party
              provider.
            </CardContent>
          </Card>
        </Link>
        <Link href="/examples/consent-management" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Consent Management</CardTitle>
              <CardDescription>Get GDPR compliant</CardDescription>
            </CardHeader>
            <CardContent>To be GDRP compliant...</CardContent>
          </Card>
        </Link> */}
      </div>
    </Content>
  );
}
