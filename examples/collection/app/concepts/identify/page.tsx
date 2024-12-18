import { Content } from '@/components/content';
import { basicIdentifyExampleFlag, fullIdentifyExampleFlag } from './flags';
import { DemoFlag } from '@/components/demo-flag';
import { Button } from '@/components/ui/button';
import { cookies } from 'next/headers';
import { CodeBlock } from '@/components/code-block';
import Link from 'next/link';
import { SelfDocumentingExampleAlert } from '@/components/self-documenting-example-alert';

export default async function Page() {
  const basic = await basicIdentifyExampleFlag();
  const full = await fullIdentifyExampleFlag();

  return (
    <Content crumbs={['concepts', 'identify']}>
      <h2>Identify</h2>
      <p>Establishing evaluation context.</p>
      <p>
        It is common for features to be on for some users, but off for others.
        For example a feature might be on for team members but off for everyone
        else.
      </p>
      <p>
        The <code>flag</code> declaration accepts an <code>identify</code>{' '}
        function. The entities returned from the <code>identify</code> function
        are passed as an argument to the <code>decide</code> function.
      </p>

      <h3>Basic example</h3>
      <p>A trivial case to illustrate the concept</p>
      <CodeBlock>{`
      import { dedupe, flag } from '@vercel/flags/next';

      export const exampleFlag = flag({
        key: 'identify-example-flag',
        identify() {
          return { user: { id: 'user1' } };
        },
        decide({ entities }) {
          return entities?.user?.id === 'user1';
        },
      });
      `}</CodeBlock>

      <DemoFlag name={basicIdentifyExampleFlag.key} value={basic} />

      <SelfDocumentingExampleAlert>
        <Link href="https://github.com/vercel/flags/blob/main/examples/docs/app/concepts/identify/page.tsx">
          Inspect the source code
        </Link>{' '}
        to see the actual usage of the feature flag.
      </SelfDocumentingExampleAlert>

      <p>
        Having first-class support for an evaluation context allows decoupling
        the identifying step from the decision making step.
      </p>

      <h3>Type safety</h3>
      <p>
        The entities can be typed using the <code>flag</code> function.
      </p>

      <CodeBlock>{`
      import { dedupe, flag } from '@vercel/flags/next';

      interface Entities {
        user?: { id: string };
      }

      export const exampleFlag = flag<boolean, Entities>({
        key: 'identify-example-flag',
        identify() {
          return { user: { id: 'user1' } };
        },
        decide({ entities }) {
          return entities?.user?.id === 'user1';
        },
      });
      `}</CodeBlock>

      <h3>Headers and Cookies</h3>
      <p>
        The <code>identify</code> function is called with <code>headers</code>{' '}
        and <code>cookies</code> arguments, which is useful when dealing with
        anonymous or authenticated users.
      </p>
      <p>
        The arguments are normalized to a common format so the same flag to be
        used in Edge Middleware, App Router and Pages Router without having to
        worry about the differences in how <code>headers</code> and{' '}
        <code>cookies</code> are represented there.
      </p>
      <CodeBlock>{`
      import { flag } from '@vercel/flags/next';
      
      export const exampleFlag = flag<boolean, Entities>({
        // ...
        identify({ headers, cookies }) {
          // access to normalized headers and cookies here
          headers.get("auth")
          cookies.get("auth")?.value
          // ...
        },
        // ...
      });
      `}</CodeBlock>

      <h3>Deduplication</h3>
      <p>
        The <code>dedupe</code> function is a helper to prevent duplicate work.
      </p>
      <p>
        Any function wrapped in <code>dedupe</code> will only ever run once for
        the same request within the same runtime and given the same arguments.
      </p>
      <p>
        This helper is extremly useful in combination with the{' '}
        <code>identify</code> function, as it allows the identification to only
        happen once per request. This is useful in preventing overhead when
        passing the same <code>identify</code> function to multiple feature
        flags.
      </p>
      <p>
        <Link href="/concepts/dedupe">Learn more</Link> about{' '}
        <code>dedupe</code>.
      </p>

      <h3>Custom evaluation context</h3>
      <p>
        While it is best practice to let the <code>identify</code> function
        determine the evaluation context, it is possible to provide a custom
        evaluation context.
      </p>
      <CodeBlock>{`
      // pass a custom evaluation context from the call side
      await exampleFlag.run({ identify: { user: { id: 'user1' } } });

      // pass a custom evaluation context function from the call side
      await exampleFlag.run({ identify: () => ({ user: { id: 'user1' } }) });
      `}</CodeBlock>
      <p>
        This should be used sparsely, as custom evaluation context can make
        feature flags less predictable across your code base.
      </p>

      <h3>Full example</h3>
      <p>
        The example below shows how to use the <code>identify</code> function to
        display different content to different users.
      </p>

      <div className="flex gap-2">
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.set('identify-example-user-id', 'user1');
          }}
          variant="outline"
        >
          Act as a flagged in user
        </Button>
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.set('identify-example-user-id', 'user2');
          }}
          variant="outline"
        >
          Act as a flagged out user
        </Button>
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.delete('identify-example-user-id');
          }}
          variant="outline"
        >
          Clear cookie
        </Button>
      </div>
      <DemoFlag name={fullIdentifyExampleFlag.key} value={full} />
      <SelfDocumentingExampleAlert>
        <Link href="https://github.com/vercel/flags/blob/main/examples/docs/app/concepts/identify/page.tsx">
          Inspect the source code
        </Link>{' '}
        to see the actual usage of the feature flag.
      </SelfDocumentingExampleAlert>

      <p>The above example is implemented using this feature flag:</p>
      <CodeBlock>{`
        import type { ReadonlyRequestCookies } from '@vercel/flags';
        import { dedupe, flag } from '@vercel/flags/next';

        interface Entities {
          user?: { id: string };
        }

        const identify = dedupe(
          ({ cookies }: { cookies: ReadonlyRequestCookies }): Entities => {
            // This could read a JWT instead
            const userId = cookies.get('identify-example-user-id')?.value;
            return { user: userId ? { id: userId } : undefined };
          },
        );

        export const identifyExampleFlag = flag<boolean, Entities>({
          key: 'identify-example-flag',
          identify,
          decide({ entities }) {
            if (!entities?.user) return false;
            return entities.user.id === 'user1';
          },
        });
        `}</CodeBlock>
    </Content>
  );
}
