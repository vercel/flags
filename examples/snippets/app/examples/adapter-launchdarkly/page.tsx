import { summerSaleFlag } from './flags';

export default async function Page() {
  const summerSale = await summerSaleFlag();
  return <div>Flag is on {summerSale ? 'Yes' : 'No'}</div>;
}
