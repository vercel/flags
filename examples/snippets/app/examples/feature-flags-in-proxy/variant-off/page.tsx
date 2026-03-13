import { Shared } from '../shared';

export default async function Page() {
  // we statically know that the flag is false as this is the variant-off page
  return <Shared variant="off" />;
}
