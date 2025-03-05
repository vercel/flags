import { exampleFlag } from './flags';

export default async function Page() {
  const example = await exampleFlag();
  return <div>Flag is on {example ? 'Yes' : 'No'}</div>;
}
