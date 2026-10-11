import {
  conformanceResult,
  setConformanceSignal,
} from '@flags-sdk/conformance';
import { flags } from '@flags-sdk/hono';
import { serve } from '@hono/node-server';
import { evaluate } from 'flags';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
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

// The route of the conformance suite. An HTTPException is its signal.
setConformanceSignal(() => new HTTPException(307));
app.get('/conformance', async (c) => c.json(await conformanceResult()));

app.get('/config', async (c) => c.json({ checkout: await newCheckout() }));

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4340) });
