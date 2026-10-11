import { serve } from '@hono/node-server';
import { evaluate, runtime } from 'flags';
import { Hono } from 'hono';
import { bannerText, summerSale } from './flags.ts';

const app = new Hono();

// Each request runs in runtime.onInvoke, so the flags get the request
app.use((c, next) => runtime.onInvoke(c.req.raw, next));

app.get('/', async (c) => {
  const [sale, banner] = await evaluate([summerSale, bannerText]);
  return c.json({ sale, banner });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4340) });
