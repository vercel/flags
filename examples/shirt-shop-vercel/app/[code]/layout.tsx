import { encryptFlagValues } from 'flags';
import { deserialize, generatePermutations } from 'flags/next';
import { FlagValues } from 'flags/react';
import { Suspense } from 'react';
import { FreeDelivery } from '@/app/free-delivery';
import { DevTools } from '@/components/dev-tools';
import { Footer } from '@/components/footer';
import { Navigation } from '@/components/navigation';
import { productFlags, showFreeDeliveryBannerFlag } from '@/flags';

export async function generateStaticParams() {
  // Returning an empty array here is important as it enables ISR, so
  // the various combinations stay cached after they first time they were rendered.
  //
  // return [];

  // Instead of returning an empty array you could also call generatePermutations
  // to generate the permutations upfront.
  const codes = await generatePermutations(productFlags);
  return codes.map((code) => ({ code }));
}

async function EncryptedFlagValues({
  values,
}: {
  values: Record<string, unknown>;
}) {
  const encryptedFlagValues = await encryptFlagValues(values);
  return <FlagValues values={encryptedFlagValues} />;
}

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{
    code: string;
  }>;
}) {
  const params = await props.params;
  const values = await deserialize(productFlags, params.code);

  const showFreeDeliveryBanner = await showFreeDeliveryBannerFlag(
    params.code,
    productFlags,
  );

  return (
    <div className="bg-white">
      <FreeDelivery show={showFreeDeliveryBanner} />
      <Navigation />
      {props.children}
      <Suspense>
        <EncryptedFlagValues values={values} />
      </Suspense>
      <Footer />
      <DevTools />
    </div>
  );
}
