"use client";

import { track } from "@vercel/analytics";
import { toast } from "sonner";
import { ProceedToCheckoutButton } from "@/components/shopping-cart/proceed-to-checkout-button";

export function ProceedToCheckout({ color }: { color: string }) {
  return (
    <ProceedToCheckoutButton
      color={color}
      onClick={() => {
        track("proceed_to_checkout:clicked");
        toast("End reached", {
          className: "my-classname",
          description: "The checkout flow is not implemented in this template.",
          duration: 5000,
        });
      }}
    />
  );
}
