import { Content } from '@/components/content';
import Link from 'next/link';

export default function ExamplesPage() {
  return (
    <Content crumbs={['api-reference']}>
      <h2>API Reference</h2>
      <div>Shows the APIs available in the Flags SDK</div>
      <h3>@vercel/flags</h3>
      <p>APIs for integrating flags with Vercel.</p>
      <p>
        <Link
          href="https://vercel.com/docs/workflow-collaboration/feature-flags/vercel-flags"
          target="_blank"
        >
          Learn more
        </Link>{' '}
        about these methods.
      </p>
      <h3>@vercel/flags/next</h3>
      <p>APIs for working with feature flags in Next.js.</p>
      <h4>flag</h4>
      <p>Declares a new feature flag.</p>
      <h4>precompute</h4>
      <p>Precomputes the value of a group of feature flags.</p>
      <h4>combine</h4>
      <p>Calculates the combinations of flags.</p>
      <h4>dedupe</h4>
      <p>Deduplicates work.</p>
      <h4>deserialize</h4>
      <p>Deserializes a feature flag.</p>
      <h4>evaluate</h4>
      <p>Evaluates a feature flag.</p>
      <h4>generatePermutations</h4>
      <p>Generates permutations of all options of a group of flags.</p>
      <h4>getPrecomputed</h4>
      <p>Gets precomputed values of a group of flags.</p>
      <h4>getProviderData</h4>
      <p>Turns flag definitions into provider data Vercel understands.</p>
      <h4>serialize</h4>
      <p>Serializes a feature flag.</p>
      <h4>setTracerProvider</h4>
      <p>Set an OpenTelemetry tracer provider.</p>
    </Content>
  );
}
