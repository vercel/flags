import { CodeBlock } from '@/components/code-block';
import { Content } from '@/components/content';
import Link from 'next/link';

export default function ExamplesPage() {
  return (
    <Content crumbs={['vercel']}>
      <h2>Vercel</h2>
      <p>Integrate your flags with Vercel.</p>
      <h4>Flags Explorer</h4>
      <p>
        The Flags Explorer lives in the Vercel Toolbar and allows overriding any
        feature flags for your session only, without affecting your team
        members.{' '}
      </p>
      <p>
        The Flags SDK will automatically respect overrides set by the Flags
        Explorer.
      </p>
      <h4>Logs</h4>
      <p>
        Requests will automatically be annotated with the evaluated feature
        flags. The flag values can then be seen in the Log details view.
      </p>
      <h4>Analytics</h4>
      <p>
        The Flags SDK can annotate requests with the evaluated feature flags.
        The flag values can then be seen in the Analytics view.
      </p>
      <h4>Edge Config</h4>
      <p>
        Edge Config is a globally replicated, ultra-low latency, highly
        available system designed to store feature flags. Edge Config reads are
        extremely fast, as Vercel co-locates the data stored in Edge Config with
        the Vercel Functions. This allows your functions to read Edge Config
        without going over the network in most cases.
      </p>
      <p>
        This extremely low latency is perfect for feature flags. Vercel has
        integrations with many providers to sync their feature flags into Edge
        Config, from which your application can then bootstrap them when
        handling requests.
      </p>
      <h4>OpenTelemetry</h4>
      <p>
        The Flags SDK can be used with OpenTelemetry to annotate requests with
        the evaluated feature flags.
      </p>
      <CodeBlock>{`
        // instrumentation.ts
        import { registerOTel } from '@vercel/otel'
        import { setTracerProvider } from '@vercel/flags'
        import { trace } from '@opentelemetry/api'

        export function register(): void {
          if (process.env.NODE_ENV === 'development') return
          registerOTel({ serviceName: 'example-app' })
          setTracerProvider(trace)
        }
      `}</CodeBlock>
      <p>
        <Link href="https://vercel.com/docs/observability/otel-overview">
          Learn more
        </Link>{' '}
        about using the Vercel OpenTelemetry Collector.
      </p>
    </Content>
  );
}
