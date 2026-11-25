import { enableSale } from '../app.flags';

export async function load() {
  return { sale: await enableSale() };
}
