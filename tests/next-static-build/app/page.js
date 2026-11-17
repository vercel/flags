import { encryptFlagValues } from 'flags';
import { FlagValues } from 'flags/react';

// The build fails when the page can not be static
export const dynamic = 'error';

export default async function Page() {
  const values = await encryptFlagValues({ sale: true });
  return <FlagValues values={values} />;
}
