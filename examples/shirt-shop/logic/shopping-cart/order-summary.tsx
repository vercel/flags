import { proceedToCheckoutColorFlag } from '@/flags';
import { OrderSummarySection } from '@/components/shopping-cart/order-summary-section';

export async function OrderSummary({
  showSummerBanner,
  freeDelivery,
}: {
  showSummerBanner: boolean;
  freeDelivery: boolean;
}) {
  // This is a fast feature flag so we don't suspend on it
  const proceedToCheckoutColor = await proceedToCheckoutColorFlag();

  return (
    <OrderSummarySection
      showSummerBanner={showSummerBanner}
      freeDelivery={freeDelivery}
      proceedToCheckoutColor={proceedToCheckoutColor}
    />
  );
}
