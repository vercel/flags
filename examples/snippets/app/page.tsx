import { Content } from '@/components/content';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';

export const dynamic = 'error';

function ConceptCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} className="no-underline">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

export default function Page() {
  return (
    <Content>
      <h1>Flags SDK</h1>
      <p>This page contains example snippets for the Flags SDK.</p>
      <p>
        See <Link href="https://flags-sdk.com">flags-sdk.com</Link> for the full
        documentation, or{' '}
        <Link
          href="https://github.com/vercel/flags/tree/main/examples/snippets"
          target="_blank"
        >
          GitHub
        </Link>{' '}
        for the source code.
      </p>
      <h2>Snippets</h2>
      <h3>Concepts</h3>
      <div className="flex flex-col gap-4">
        <ConceptCard
          title="Adapter"
          description="How to use an adapter with the Flags SDK"
          href="/concepts/adapters"
        />
        <ConceptCard
          title="Dedupe"
          description="How to use dedupe with the Flags SDK"
          href="/concepts/dedupe"
        />
        <ConceptCard
          title="Identify (Basic)"
          description="Establishing evaluation context"
          href="/concepts/identify/basic"
        />
        <ConceptCard
          title="Identify (Advanced)"
          description="Establishing evaluation context"
          href="/concepts/identify/full"
        />
        <ConceptCard
          title="Precompute (Manual)"
          description="Precompute flags manually"
          href="/concepts/precompute/manual"
        />
        <ConceptCard
          title="Precompute (Automatic)"
          description="Precompute flags with the full setup"
          href="/concepts/precompute/automatic"
        />
        <h3>Examples</h3>
        <ConceptCard
          title="Dashboard Page"
          description="Using feature flags on dynamic pages"
          href="/examples/dashboard-pages"
        />
        <ConceptCard
          title="Marketing Page"
          description="Using feature flags on static pages"
          href="/examples/marketing-pages"
        />
        <ConceptCard
          title="Feature Flags in Edge Middleware"
          description="Manually using feature flags in Edge Middleware"
          href="/examples/feature-flags-in-edge-middleware"
        />
        <ConceptCard
          title="Pages Router (Basic)"
          description="Using feature flags in Pages Router on dynamic pages"
          href="/examples/pages-router-dynamic"
        />
        <ConceptCard
          title="Pages Router (Precomputed)"
          description="Using feature flags in Pages Router on static pages"
          href="/examples/pages-router-precomputed"
        />
        <ConceptCard
          title="Suspense Fallbacks"
          description="Using prerendered suspense fallbacks"
          href="/examples/suspense-fallbacks"
        />
      </div>
    </Content>
  );
}
