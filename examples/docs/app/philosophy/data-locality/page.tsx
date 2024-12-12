import { Content } from '@/components/content';
import Link from 'next/link';

export default function Page() {
  return (
    <Content crumbs={['philosophy', 'data-locality']}>
      <h3>Data Locality</h3>
      <p>
        Where feature flags are evaluated, the data they need to do so, and the
        consequences this has on latency.
      </p>
      <p>In order to evaluate feature flags two types of data are needed:</p>
      <ul>
        <li>
          The <b>definition</b> contains the rules for evaluating the feature,
          such as who the feature flag should be enabled for. This is typcially
          loaded from a feature flag provided.
        </li>
        <li>
          The <b>evaluation context</b> is data about the user or entity the
          feature flags are evaluated for.
        </li>
      </ul>

      <p>A feature flag evaluation can be thought of like this</p>
      <pre>evaluate(definition, evaluation context) = value</pre>
      <p>
        Evaluating a feature flag requires the definition and the evaluation
        context.
      </p>
      <p>
        A simple feature flag which is on or off for all users does not need an
        evaluation context. An advanced feature flag which is only on for some
        users needs an evaluation context.
      </p>
      <h4>Where feature flags can be evaluated</h4>
      <ul>
        <li>
          <b>Server-side</b> runs in the{' '}
          <Link
            href="https://vercel.com/docs/functions/configuring-functions/region"
            target="_blank"
          >
            Serverless Function Region
          </Link>{' '}
          configured for the project and is used for React Server Components,
          API Routes, and Server Actions.
        </li>
        <li>
          <b>Edge Middleware</b> runs globally, in our Edge Network.
        </li>
        <li>
          <b>Client-side</b> runs in your browser.
        </li>
      </ul>
      <p>
        There are different considerations for how the defintions and the
        evaluation context are loaded or established. For example, it has
        disasterous consequences if an application needs to make a network
        request from Edge Middleware in order to establish the current user for
        the evalaution context.
      </p>
      <h4>How feature flag definitions are loaded</h4>
      <p>
        Feature flag SDKs initially need to bootstrap the feature flag
        definitions. Typically this happens using a network request. They then
        typically establish a websocket connection to get notified about any
        changes to the feature flag configuration in the flag provider.
      </p>
      <p>
        This model works well with long-running servers, but is not a great fit
        for the serverless world. Serverless functions have a much shorter
        lifetime than long-running servers, especially at the edge. This means
        applications need to pay the latency cost of bootstrapping feature flags
        more frequently. Having multiple websocket connections to the same flag
        provider also increases load on the provider.
      </p>
      <h4>Vercel Edge Config</h4>
      <p>
        Vercel offers a solution called Edge Config to this problem. It is
        specifically designed for storing feature flag definitions. Edge Config
        can be read in under 1ms at p90 and under 15ms at p95, including the
        network latency from your Serverless Function or Edge Middleware.
      </p>
      <p>
        To put this into perspective,{' '}
        <Link href="https://github.com/dvassallo/s3-benchmark">
          according to this benchmark
        </Link>
        , an AWS S3 bucket does not even send the first byte by the time an Edge
        Config is fully read.
      </p>
      <p>
        Using Edge Config is optional, but highly recommended, when using the
        Flags SDK.
      </p>
      <h4>Evaluating on the server</h4>
      <p>
        Feature flags can be evaluated on the server using the Flags SDK. This
        is the most common way to evaluate feature flags, and is the easiest to
        implement.
      </p>
      <p>
        The serverless function region is typically close to your
        application&apos;s database, so it is somewhat okay to make a network
        request to establish the evaluation context.
      </p>
      <h4>Evaluating at the edge</h4>
      <p>
        In order to evaluate feature flags at the edge it&apos;s necessary to
        have the definition and the evaluation context available at the edge.
      </p>
      <p>
        Using Edge Config allows storing definitions at the Edge as shown in the
        previous section. This means feature flags can be used in Edge
        Middleware at ultra low latency.
      </p>
      <p>
        However, some feature flags migth need an evaluation context in order to
        evaluate. Since the evaluation context depends on the application it is
        up to the application to provide it at low latency.
      </p>
      <p>
        Making a network request or reading a database to get the evaluation
        context inside of Edge Middleware should be avoided at all cost.
      </p>
      <p>
        Instead, it is wise to store the information necessary to evaluate
        feature flags in a cookie when users sign into an application. The
        browser will then forward the necessary information when making
        requests, such that Edge Middlware can establish the evaluation context
        based on the provided cookie. Where necessary, the cookie stored on the
        client can be sigend or even encrypted to avoid manipulation or leaking
        information.
      </p>
      <h4>Deduplicating effort</h4>
      <p>
        No matter whether feature flags are evaluated in Serverless Functions or
        in Edge Middleware it is wise to deduplicate the effort of establishing
        the evaluation context.
      </p>
      <p>
        <Link href="/concepts/dedupe">Learn more</Link> about{' '}
        <code>dedupe</code>.
      </p>
      <h4>Evaluating on the client</h4>
      <p>
        Feature flags can also be evaluated on the client. The Flags SDK does
        not have a built-in pattern for doing so currently.
      </p>
      <p>
        It is however possible to evalaute feature flags on the server and pass
        the evaluated value down to the client.
      </p>
      <p>
        There is also a pattern, independent of the Flags SDK, which is
        recommended in case you must absolutely use client-side feature flags.
      </p>
      <p>
        <Link href="#">Learn more</Link> about bootstrapping datafiles.
      </p>
    </Content>
  );
}
