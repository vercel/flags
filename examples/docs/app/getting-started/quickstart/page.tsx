import { CodeBlock } from '@/components/code-block';
import { Content } from '@/components/content';
import Link from 'next/link';

export default function Page() {
  return (
    <Content crumbs={['getting-started', 'quickstart']}>
      <h3>Quickstart</h3>
      <h4>Installation</h4>
      <p>Install using your package manager.</p>
      <CodeBlock lang="shell">{`npm install @vercel/flags`}</CodeBlock>
      <p>
        Then create an environment variable called <code>FLAGS_SECRET</code>.
      </p>
      <p>
        The <code>FLAGS_SECRET</code> value must have a specific length (32
        random bytes encoded in base64) to work as an encryption key. Create one
        using node:
      </p>
      <CodeBlock lang="shell">
        {`node -e "console.log(crypto.randomBytes(32).toString('base64url'))"`}
      </CodeBlock>
      <p>
        This secret is required to use the SDK. It is used to read overrides and
        to encrypt flag values in case they are sent to the client and should
        stay secret.
      </p>
      <p>
        This secret will also be used in case you are using the Flags Explorer
        in the Vercel Toolbar.
      </p>
      <h4>Declaring a feature flag</h4>
      <p>
        Create a file called <code>flags.ts</code> in your project.
        <br />
        Then declare your first feature flag there.
      </p>
      <CodeBlock>
        {`
        import { flag } from '@vercel/flags/next';

        export const exampleFlag = flag({
          key: "example-flag",
          decide() {
            return false;
          }
        });`}
      </CodeBlock>
      <p>
        The feature flags declared here should only ever be used server-side.
      </p>
      <h4>Using your first feature flag</h4>
      <p>Using a feature flag in a React Server Component.</p>
      <CodeBlock>
        {`
        import { exampleFlag } from '../../flags';

        export default async function Page() {
          const example = await exampleFlag();
          return <div>{example ? 'Example' : 'No Example'}</div>;
        }`}
      </CodeBlock>
      <p>Feature Flags can also be used in Edge Middleware or API Routes.</p>
      <h4>This was just the beginning</h4>
      <p>
        There is way more to the Flags SDK than shown in this quickstart. Make
        sure to explore the <Link href="/concepts">Concepts</Link> to learn how
        to target inidivual users, how to use feature flags for static pages,
        how to integrate feature flag providers using adapters and much more.
      </p>
    </Content>
  );
}
