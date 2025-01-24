import { summerSaleFlag } from './flags';

export default async function Page() {
  const summerSale = await summerSaleFlag();
  return <div>AdapterLaunchDarkly: {summerSale ? 'Yes' : 'No'}</div>;
}
