import { CodeBlock } from '@/components/code-block';
import { Content } from '@/components/content';
import Link from 'next/link';

export default function Page() {
  return (
    <Content crumbs={['philosophy', 'flags-as-code']}>
      <h3>Flags as Code</h3>
      <p>
        The Vercel Flags SDK is conceptually different from the SDKs of most
        feature flag providers.
      </p>
      <h4>Consistently simple call sides</h4>
      <p>
        Using the SDK of a typical feature flag provider looks similar to the
        code example below, where the SDK is called with the name of the feature
        flag as a string.
      </p>
      <CodeBlock>
        {`
        // a typical feature flag SDK, such as OpenFeature in this example
        const exampleValue = await client.getBooleanValue(
          'exampleFlag',
          false
        );`}
      </CodeBlock>
      <p>
        Compare this to what it looks like when using a feature flag in the
        Vercel Flags SDK.
      </p>
      <CodeBlock>
        {`
      // the Vercel Flags SDK
      const exampleValue = await exampleFlag();`}
      </CodeBlock>
      <p>
        Being able to use a feature flag of course requires first declaring it
        like so:
      </p>
      <CodeBlock>
        {`
        import { flag } from '@vercel/flags/next';

        export const exampleFlag = flag({
          key: "example-flag",
          defaultValue: false,
          decide() {
            return false;
          }
        });`}
      </CodeBlock>
      <h4>Feature Flags are functions</h4>
      <p>
        Turning each feature flag into its own function means the implementation
        can change without having to touch the call side. It also allows you to
        use your well-known editor aids like “Find All References” to see if a
        flag is still in use.
      </p>
      <h4>Feature Flags declare their default value</h4>
      <p>
        Each feature flag&apos;s declaration can contain the default value. This
        value is used in case the feature flag can not be evaluated. Containing
        the default value on the declaration means it will be consistent across
        all evaluations.
      </p>
      <p>
        <Link href="#">Learn more</Link> about <code>defaultValue</code>.
      </p>
      <h4>Feature Flags declare how their context is established</h4>
      <p>
        Traditional feature flag SDKs require passing in the context on the call
        side, as shown below.
      </p>
      <CodeBlock>
        {`
      // a typical feature flag SDK, such as OpenFeature in this example

      // add a value to the invocation context
      const context = {
        user: { id: '123' },
      };

      const boolValue = await client.getBooleanValue(
        'boolFlag',
        false,
        context
      );`}
      </CodeBlock>
      <p>
        The big downside of this approach is that every call side needs to
        recreate the evaluation context. If the evaluation context is created
        differently or not provided the feature flag may evaluate differently
        across the codebase.
      </p>
      <p>
        The Vercel Flags SDK does not require the context to be passed in on
        each invocation. Instead, the context is established on the declaration
        of the feature flag.
      </p>
      <CodeBlock>
        {`
        import { flag } from '@vercel/flags/next';

        export const exampleFlag = flag({
          key: "example-flag",
          identify() {
            return { user: { id: '123' } };
          },
          decide({ entities }) {
            return entities.user.id === '123';
          }
        });`}
      </CodeBlock>
      <p>
        <Link href="/concepts/identify">Learn more</Link> about{' '}
        <code>identify</code>.
      </p>
      <h4>Avoid vendor lock-in</h4>
      <p>
        A downside of using the SDK of a specific provider is that it makes it
        hard to switch to a different feature flag provider down the road. Often
        the provider&apos;s SDK becomes deeply integrated into the codebase over
        time.
      </p>
      <p>
        The Vercel Flags SDK does not lock you into a specific provider. You can
        easily switch to a different provider by changing the definition of the
        feature flag. Switching providers is possible without changing where
        your feature flag is used.
      </p>
      <p>
        The Vercel Flags SDK further specifically contains an adapter pattern
        for this, which makes it even easier to swap providers.
      </p>
      <CodeBlock>
        {`
        import { flag } from '@vercel/flags/next';
        import { statsig } from "@flags-sdk/statsig";

        export const exampleFlag = flag({
          key: "example-flag",
          // simply replace the adapter with a different one
          adapter: statsig(),
        });`}
      </CodeBlock>
      <p>
        <Link href="#">Learn more</Link> about <code>adapters</code>.
      </p>
    </Content>
  );
}
