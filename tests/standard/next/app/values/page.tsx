import { FlagValues } from '@flags-sdk/next/flag-values';
import { bannerText, newCheckout, summerSale } from '../../flags';

// The values of the flags in the page, encrypted with FLAGS_SECRET, or plain
export default async function ValuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { plain } = await searchParams;
  return (
    <main>
      <FlagValues
        flags={[summerSale, newCheckout, bannerText]}
        plain={plain !== undefined}
      />
    </main>
  );
}
