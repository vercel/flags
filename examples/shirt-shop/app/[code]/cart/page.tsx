import { getPrecomputed } from '@flags-sdk/next/precompute';
import { Main } from '@/components/main';
import { OrderSummarySection } from '@/components/shopping-cart/order-summary-section';
import { ShoppingCart } from '@/components/shopping-cart/shopping-cart';
import {
  proceedToCheckoutColorFlag,
  showFreeDeliveryBannerFlag,
  showSummerBannerFlag,
} from '@/flags';
import { productFlags } from '@/product-flags';
import { ProceedToCheckout } from './proceed-to-checkout';

export default async function CartPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [showSummerBanner, freeDeliveryBanner, proceedToCheckoutColor] =
    await getPrecomputed(
      [
        showSummerBannerFlag,
        showFreeDeliveryBannerFlag,
        proceedToCheckoutColorFlag,
      ],
      productFlags,
      code,
    );

  return (
    <Main>
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-12 xl:gap-x-16">
        <ShoppingCart />
        <OrderSummarySection
          showSummerBanner={showSummerBanner}
          freeDelivery={freeDeliveryBanner}
          proceedToCheckout={
            <ProceedToCheckout color={proceedToCheckoutColor} />
          }
        />
      </div>
    </Main>
  );
}
