import { serve } from '@hono/node-server';
import { evaluate } from 'flags';
import { flags } from 'flags/hono';
import { Hono } from 'hono';
import { newCheckout } from './default-flags.ts';
import { config } from './flags.config.ts';
import { bannerText, summerSale } from './flags.ts';

const app = new Hono();

// Each request runs in runtime.onInvoke, and the SDK uses flags.config.ts
app.use(flags({ config }));

app.get('/', async (c) => {
  const [sale, banner] = await evaluate([summerSale, bannerText]);
  return c.json({ sale, banner });
});

app.get('/config', async (c) => c.json({ checkout: await newCheckout() }));

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4340) });
