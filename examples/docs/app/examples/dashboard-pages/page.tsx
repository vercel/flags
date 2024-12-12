import { CodeBlock } from '@/components/code-block';
import { Content } from '@/components/content';
import { dashboardFlag } from './flags';
import { DemoFlag } from '@/components/demo-flag';
import { Button } from '@/components/ui/button';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { SelfDocumentingExampleAlert } from '@/components/self-documenting-example-alert';

export default async function Page() {
  const dashboard = await dashboardFlag();

  return (
    <Content crumbs={['examples', 'dashboard-pages']}>
      <h2>Dashboard Pages</h2>
      <p>
        This example shows how to use feature flags for dashboard pages.
        Dashboard pages are typically rendered at request time, and dashboard
        pages typically require an authentiacted user.
      </p>
      <h3>Example</h3>
      <p>
        The example below shows how to use feature flags to show a feature to a
        specific users on a dashboard page. They are flagged in based on their
        user id. The buttons below allow you to either act as a flagged in user
        or as a regular user.
      </p>
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.set('dashboard-user-id', 'user1');
          }}
          variant="outline"
        >
          Act as a flagged in user
        </Button>
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.set('dashboard-user-id', 'user2');
          }}
          variant="outline"
        >
          Act as a regular user
        </Button>
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.delete('dashboard-user-id');
          }}
          variant="outline"
        >
          Clear cookie
        </Button>
      </div>
      <DemoFlag name={dashboardFlag.key} value={dashboard} />
      <SelfDocumentingExampleAlert>
        <Link href="https://github.com/vercel/flags/blob/main/examples/docs/app/examples/dashboard-pages/page.tsx">
          Inspect the source code
        </Link>{' '}
        to see the actual usage of the feature flag.
      </SelfDocumentingExampleAlert>
      <h3>Definition</h3>
      <p>The example above works by first defining a feature flag.</p>
      <CodeBlock>
        {`
import type { ReadonlyRequestCookies } from '@vercel/flags';
import { flag, dedupe } from '@vercel/flags/next';

interface Entities {
  user?: { id: string };
}

const identify = dedupe(
  ({ cookies }: { cookies: ReadonlyRequestCookies }): Entities => {
    const userId = cookies.get('dashboard-user-id')?.value;
    return { user: userId ? { id: userId } : undefined };
  },
);

export const dashboardFlag = flag<boolean, Entities>({
  key: 'dashboard-flag',
  identify,
  decide({ entities }) {
    if (!entities?.user) return false;
    // Allowed users could be loaded from Edge Config or elsewhere
    const allowedUsers = ['user1'];

    return allowedUsers.includes(entities.user.id);
  },
});
        `}
      </CodeBlock>
      <p>
        The definition includes an <code>identify</code> function. The
        <code>identify</code> function is used to establish the evaluation
        context.
      </p>
      <p>
        The example reads the user id directly from the cookie. In a real
        dashboard you would likely read a signed JWT instead.
      </p>
      <h3>Usage</h3>
      <p>Any server-side code can evaluate the feature flag by calling it.</p>
      <CodeBlock>
        {`
        export default async function DashboardPage() {
          const dashboard = await dashboardFlag();
          // do something with the flag
          return <div>Dashboard</div>;
        }
        `}
      </CodeBlock>
      <p>
        Since dashboard pages are typically dynamic anyhow the async call to
        evaluate the feature flag should fit right in.
      </p>
      <h3>Identifying</h3>
      <p>
        The example flag calls <code>identify</code> to establish the evaluation
        context. This function returns the entities that are used to evaluate
        the feature flag.
      </p>
      <p>
        The <code>decide</code> function then later gets access to the{' '}
        <code>entities</code> returned from the <code>identify</code> function.
      </p>
      <p>
        <Link href="/concepts/identify">Learn more</Link> about{' '}
        <code>identify</code>.
      </p>
      <h3>Evaluation Context</h3>
      <p>
        Feature Flags used on dashboard will usually run in the Serverless
        Function Region, close to the database. This means it is accetable for a
        feature flag&apos;s <code>decide</code> function to read the database
        when establishing the evaluation context. However, ideally, it would
        only read from the JWT as this will lead to lower overall latency.
      </p>
      <h3>Deduplication</h3>
      <p>
        The <code>identify</code> call uses <code>dedupe</code> to avoid
        duplicate work when multiple feature flags depend on the same evaluation
        context.
      </p>
      <p>
        <Link href="/concepts/dedupe">Learn more</Link> about{' '}
        <code>dedupe</code>.
      </p>
    </Content>
  );
}
