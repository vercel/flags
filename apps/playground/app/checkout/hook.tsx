import { track } from '@vercel/analytics/react';
import { useEffect } from 'react';
import type { CheckoutExperiment, Entity } from '@/types';

export function useExperiment(
  experiment: CheckoutExperiment,
  identity: Entity,
) {
  useEffect(() => {
    if (!experiment) return;

    track('exposure', {
      unitId: identity.visitor.id,
      unitType: experiment.unitType,
      experimentId: experiment.experimentId,
      variantId: experiment.variantId,
    });
  }, [experiment, identity.visitor.id]);

  return experiment.params;
}
