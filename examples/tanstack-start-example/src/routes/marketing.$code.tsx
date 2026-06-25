import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { firstMarketingABTest, secondMarketingABTest } from '../flags';
import { marketingFlags } from '../precomputed-flags';

// Reading precomputed flags is cheap: `flag(code, marketingFlags)` decodes the
// value from the signed code without re-running `decide`.
const getMarketingFlags = createServerFn()
  .validator((code: string) => code)
  .handler(async ({ data: code }) => {
    return {
      first: await firstMarketingABTest(code, marketingFlags),
      second: await secondMarketingABTest(code, marketingFlags),
    };
  });

export const Route = createFileRoute('/marketing/$code')({
  loader: ({ params }) => getMarketingFlags({ data: params.code }),
  component: MarketingPage,
});

function MarketingPage() {
  const { first, second } = Route.useLoaderData();
  const { code } = Route.useParams();

  return (
    <main>
      <h1>Marketing A/B Test</h1>
      <p>
        Precomputed code: <code>{code}</code>
      </p>
      <ul>
        <li>
          firstMarketingABTest: <strong>{String(first)}</strong>
        </li>
        <li>
          secondMarketingABTest: <strong>{String(second)}</strong>
        </li>
      </ul>
    </main>
  );
}
