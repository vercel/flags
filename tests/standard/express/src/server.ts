import { flags } from '@flags-sdk/express';
import express from 'express';
import { evaluate } from 'flags';
import { config } from './flags.config.ts';
import { greeting, newCheckout } from './flags.ts';

const app = express();

// Each request runs in runtime.onInvoke, and the SDK uses flags.config.ts
app.use(flags({ config }));

app.get('/', async (_request, response) => {
  const [checkout, text] = await evaluate([newCheckout, greeting]);
  response.json({ checkout, text });
});

// The flags of a later step of an async handler belong to the same request
app.get('/later', async (_request, response) => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  response.json({ checkout: await newCheckout() });
});

app.listen(Number(process.env.PORT ?? 4360));
