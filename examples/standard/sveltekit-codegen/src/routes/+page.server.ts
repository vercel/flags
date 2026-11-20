import { enableSale } from 'flags:self';

export async function load() {
  return { sale: await enableSale() };
}
