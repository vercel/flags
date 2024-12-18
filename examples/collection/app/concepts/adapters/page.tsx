import { CodeBlock } from '@/components/code-block';
import { Content } from '@/components/content';
import { DemoFlag } from '@/components/demo-flag';
import { customAdapterFlag } from './flags';
import { SelfDocumentingExampleAlert } from '@/components/self-documenting-example-alert';
import Link from 'next/link';

export default async function Page() {
  const customAdapter = await customAdapterFlag();
  return (
    <Content crumbs={['concepts', 'adapters']}>
      <h2>Adapters</h2>
      <p>Integrate any flag provider.</p>
      <p>
        It is possible to integrate any feature flag provider with the Flags SDK
        using an adapter. We publish adapters for the most common providers, but
        it is also possible to write a custom adapter in case we don&apos;t list
        your provider or in case you have an in-house solution for feature
        flags.
      </p>
      <p>
        Adapters conceptually replace the <code>decide</code> and{' '}
        <code>origin</code> parts of a flag declaration.
      </p>
      <h3>How to use an existing adapter</h3>
      <p className="italic">
        Adapters are still a work-in-progress. We have not published any offical
        adapters yet, but it is already possible to create your own as described
        below.
      </p>
      <CodeBlock>
        {`
        // THIS IS A PREVIEW
        // The @flags-sdk/* adapters are not available yet
        import { flag } from '@vercel/flags/next';
        import { statsig } from "@flags-sdk/statsig";
        
        export const exampleFlag = flag({
          key: "example-flag",
          adapter: statsig(),
        });`}
      </CodeBlock>
      <h3>How to write a custom adapter</h3>
      <p>
        Creating custom adapters is possible by creating an adapter factory.
      </p>
      <CodeBlock>{`
      import type { Adapter } from '@vercel/flags';
      import { createClient, EdgeConfigClient } from '@vercel/edge-config';

      /**
       * A factory function for your adapter
       */
      export function createExampleAdapter(/* options */) {
        // create the client for your provider here, or reuse the one
        // passed in through options

        return function exampleAdapter<ValueType, EntitiesType>(): Adapter<
          ValueType,
          EntitiesType
        > {
          return {
            origin(key) {
              // link to the flag in the provider's dashboard
              return \`https://example.com/flags/\${key}\`;
            },
            async decide({ key }): Promise<ValueType> {
              // use the SDK instance created earlier to evaluate flags here
              return false as ValueType;
            },
          };
        };
      }
      `}</CodeBlock>
      <p>This allows passing the provider in the flag declaration.</p>
      <CodeBlock>
        {`
        import { flag } from '@vercel/flags/next';
        import { createExampleAdapter } from "./example-adapter"
       
        // create an instance of the adapter
        const exampleAdapter = createExampleAdapter();
        
        export const exampleFlag = flag({
          key: "example-flag",
          // use the adapter for many feature flags
          adapter: exampleAdapter(),
        });`}
      </CodeBlock>

      <h4>Example</h4>
      <p>Below is an example of an Flags SDK adapter reading Edge Config.</p>
      <DemoFlag name={customAdapterFlag.key} value={customAdapter} />

      <SelfDocumentingExampleAlert>
        <Link href="https://github.com/vercel/flags/blob/main/examples/docs/app/concepts/adapters/page.tsx">
          Inspect the source code
        </Link>{' '}
        to see the actual usage of the feature flag.
      </SelfDocumentingExampleAlert>

      <h4>Exposing default adapters</h4>
      <p>
        In the example above, as a user of the adapter, we first needed to
        create an instance of the adapter. It is possible to simplify usage
        further by exposing a default adapter.
      </p>
      <p>
        Usage with a default adapter, where we can import a fully configured{' '}
        <code>exampleAdapter</code>.
      </p>
      <CodeBlock>
        {`
        import { flag } from '@vercel/flags/next';
        import { exampleAdapter } from "./example-adapter"
        
        export const exampleFlag = flag({
          key: "example-flag",
          // use the adapter for many feature flags
          adapter: exampleAdapter(),
        });`}
      </CodeBlock>
      <p>
        Many <code>@flags-sdk/*</code> adapters will implement this pattern. The
        default adapter will get created lazily on first usage, and can
        initialize itself based on known environment variables.
      </p>
      <CodeBlock>{`
      // extend the adapter definition to expose a default adapter
      let defaultEdgeConfigAdapter:
        | ReturnType<typeof createEdgeConfigAdapter>
        | undefined;

      /**
       * A default Vercel adapter for Edge Config
       *
       */
      export function edgeConfigAdapter<ValueType, EntitiesType>(): Adapter<
        ValueType,
        EntitiesType
      > {
        // Initialized lazily to avoid warning when it is not actually used and env vars are missing.
        if (!defaultEdgeConfigAdapter) {
          if (!process.env.EDGE_CONFIG) {
            throw new Error('Edge Config Adapter: Missing EDGE_CONFIG env var');
          }

          defaultEdgeConfigAdapter = createEdgeConfigAdapter(process.env.EDGE_CONFIG);
        }

        return defaultEdgeConfigAdapter<ValueType, EntitiesType>();
      }
      `}</CodeBlock>
    </Content>
  );
}
