import { encryptFlagValues } from 'flags';

// The build fails when the page can not be static
export const dynamic = 'error';

export default async function Page() {
  const values = await encryptFlagValues({ sale: true });
  return (
    <script type="application/json" data-flag-values>
      {JSON.stringify(values)}
    </script>
  );
}
