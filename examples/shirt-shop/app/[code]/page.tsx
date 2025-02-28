import { SummerBanner } from '@/components/banners/summer-banner';
import { ImageGallery } from '@/components/image-gallery';
import { ProductDetails } from '@/components/product-details';
import { ProductHeader } from '@/components/product-header';
import { AddToCartButton } from '@/components/add-to-cart-button';
import { ColorPicker } from '@/components/color-picker';
import { SizePicker } from '@/components/size-picker';
import { ProductDetailPageProvider } from '@/utils/product-detail-page';

import { productFlags, showSummerBannerFlag } from '@/flags';

export default async function Page(props: {
  params: Promise<{ code: string }>;
}) {
  const params = await props.params;

  const showSummerBanner = await showSummerBannerFlag(
    params.code,
    productFlags,
  );

  return (
    <ProductDetailPageProvider>
      <SummerBanner show={showSummerBanner} />
      <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6 sm:pb-24 lg:max-w-7xl lg:px-8">
        <div className="lg:grid lg:auto-rows-min lg:grid-cols-12 lg:gap-x-8">
          <ProductHeader />
          <ImageGallery />

          <div className="mt-8 lg:col-span-5">
            <ColorPicker />
            <SizePicker />
            <AddToCartButton />
            <ProductDetails />
          </div>
        </div>
      </main>
    </ProductDetailPageProvider>
  );
}
