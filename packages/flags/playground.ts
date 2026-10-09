// Run: pnpm build && node playground.ts
// Then: curl -H 'x-user: alice' localhost:3000/teams/acme
import { createServer } from 'node:http';
import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import {
  defineConnection,
  defineFlag,
  evaluate,
  runtime,
} from './dist/index.js';

const teams: Record<string, { plan: string }> = {
  acme: { plan: 'enterprise' },
  globex: { plan: 'free' },
};

const connection = defineConnection({
  provider: new TypedInMemoryProvider({
    'new-checkout': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      // On for alice only
      contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
    },
    'team-insights': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      // On for enterprise teams only
      contextEvaluator: (context) =>
        (context.team as { plan?: string } | null)?.plan === 'enterprise'
          ? 'on'
          : 'off',
    },
  } as const),
  project: { platform: 'in-memory' },
  // The last step of the chain: receives the context of the flag or of the
  // call side, and the request
  getEvaluationContext: (context: { teamId?: string } | undefined, request) => {
    console.log('connection getEvaluationContext', context);
    const team = context?.teamId ? teams[context.teamId] : undefined;
    return {
      user: request?.headers.get('x-user') ?? 'anonymous',
      team: team ? { id: context?.teamId ?? '', ...team } : null,
    };
  },
});

const newCheckout = defineFlag({
  key: 'new-checkout',
  defaultValue: false,
  connection,
});

// The middle step: converts the slug of the URL to a team id
const teamInsights = defineFlag({
  key: 'team-insights',
  defaultValue: false,
  connection,
  getEvaluationContext: (context: { slug: string }) => ({ teamId: context.slug }),
});

await runtime.onInit();

createServer((req, res) =>
  runtime.onInvoke(req, async () => {
    const slug = req.url?.match(/^\/teams\/([^/]+)/)?.[1] ?? '';
    const evaluationContext = { slug };
    const [checkout] = await evaluate([newCheckout]);
    const insights = await teamInsights({ evaluationContext });
    res.end(`${JSON.stringify({ slug, checkout, insights })}\n`);
  }),
).listen(3000, () => console.log('Listening on http://localhost:3000'));
