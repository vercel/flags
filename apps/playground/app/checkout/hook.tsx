import { track } from '@vercel/analytics/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CheckoutExperiment, Entity } from '@/types';

export function useExperiment(
  experiment: CheckoutExperiment,
  identity: Entity,
) {
  const pathname = usePathname();

  useEffect(() => {
    if (!experiment) return;
    if (pathname === '/') return;

    track('exposure', {
      unitId: identity.visitor.id,
      unitType: experiment.unitType,
      experimentId: experiment.experimentId,
      variantId: experiment.variantId,
    });
  }, [experiment, identity.visitor.id, pathname]);

  return experiment.params;
}
