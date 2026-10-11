import { evaluate, runtime } from 'flags';
import { bannerText, summerSale } from '../../lib/flags';

export default defineEventHandler((event) =>
  runtime.onInvoke(toWebRequest(event), async () => {
    const [sale, banner] = await evaluate([summerSale, bannerText]);
    return { sale, banner };
  }),
);
