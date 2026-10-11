import { evaluate } from 'flags';
import { bannerText, summerSale } from '../lib/flags';

export async function load() {
  const [sale, banner] = await evaluate([summerSale, bannerText]);
  return { sale, banner };
}
