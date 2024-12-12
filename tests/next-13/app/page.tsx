import { exampleFlag, hostFlag, cookieFlag } from '../flags';

export default async function Home() {
  const example = await exampleFlag();
  const host = await hostFlag();
  const cookie = await cookieFlag();
  return (
    <div>
      <h1>Example App Router Flag Value: {example ? 'true' : 'false'}</h1>
      <p>Host: {host}</p>
      <p>Cookie: {cookie}</p>
    </div>
  );
}
