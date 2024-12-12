import { Shared } from '../shared';

export default async function Page() {
  // we statically know that the flag is true as this is the variant-on page
  return <Shared variant="on" />;
}
