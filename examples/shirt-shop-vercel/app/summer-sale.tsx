'use client';

import { track } from '@vercel/analytics';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { SummerSaleBanner } from '@/components/banners/summer-sale-banner';

export function SummerSale(props: { show: boolean }) {
  useEffect(() => {
    if (props.show) {
      track('summer_banner:viewed', {}, { flags: ['summer-sale'] });
    }
  }, [props.show]);

  if (!props.show) return null;

  return (
    <SummerSaleBanner
      onClick={() => {
        track('summer_banner:clicked', {}, { flags: ['summer-sale'] });
        toast('End reached', {
          className: 'my-classname',
          description:
            'The summer sale is not implemented in this template. Try adding to the cart instead.',
        });
      }}
    />
  );
}
