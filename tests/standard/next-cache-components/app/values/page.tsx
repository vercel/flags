import { FlagValues } from '@flags-sdk/next/flag-values';

// A static page with known values, e.g. of getPrecomputed. No <Suspense> and
// no connection() in the application: the component has its own.
export default function ValuesPage() {
  return (
    <main>
      <p id="static">Static</p>
      <FlagValues values={{ 'summer-sale': true }} />
    </main>
  );
}
