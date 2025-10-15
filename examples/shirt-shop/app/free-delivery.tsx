"use client";

import { FreeDeliveryBanner } from "@/components/banners/free-delivery-banner";
import { track } from "@vercel/analytics";
import { useEffect } from "react";

export function FreeDelivery(props: { show: boolean }) {
  useEffect(() => {
    if (props.show) track("free_delivery_banner:viewed");
  }, [props.show]);

  if (!props.show) return null;

  return <FreeDeliveryBanner />;
}

function doIf() {
  if (true) {
    var build = true;
  }

  console.log(build);
}
