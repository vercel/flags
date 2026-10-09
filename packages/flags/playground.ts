// Run: pnpm build && node playground.ts
// Then: curl -H 'x-user: alice' localhost:3000
import { createServer } from 'node:http';
import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import {
  defineConnection,
  defineFlag,
  evaluate,
  runtime,
} from './dist/index.js';

const connection = defineConnection({
  provider: new TypedInMemoryProvider({
    'new-checkout': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      // Turns the flag on for alice only
      contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
    },
    'show-banner': {
      variants: { on: true, off: false },
      defaultVariant: 'on',
      disabled: false,
    },
  } as const),
  project: { platform: 'in-memory' },
  // Called once per request, on the first evaluation
  getEvaluationContext: ({ headers }) => {
    console.log('getEvaluationContext');
    return { user: headers.get('x-user') ?? 'anonymous' };
  },
});

const newCheckout = defineFlag({
  key: 'new-checkout',
  defaultValue: false,
  connection,
});
const showBanner = defineFlag({
  key: 'show-banner',
  defaultValue: false,
  connection,
});
const missing = defineFlag({ key: 'missing', defaultValue: false, connection });

await runtime.onInit();

createServer((req, res) =>
  runtime.onInvoke(req, async () => {
    const [checkout, banner] = await evaluate([newCheckout, showBanner]);
    const asBob = await evaluate(newCheckout, { user: 'bob' });
    const fallback = await missing(); // logs an error, returns the default
    res.end(`${JSON.stringify({ checkout, banner, asBob, fallback })}\n`);
  }),
).listen(3000, () => console.log('Listening on http://localhost:3000'));
