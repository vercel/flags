import { track } from '@vercel/analytics/react';
import { useEffect, useState } from 'react';
import type { CheckoutExperiment, Entity } from '@/types';

export function useExperiment(
  experiment: CheckoutExperiment,
  identity: Entity,
) {
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (!experiment) return;
    if (tracked) return;

    track('exposure', {
      unitId: identity.visitor.id,
      unitType: experiment.unitType,
      experimentId: experiment.experimentId,
      variantId: experiment.variantId,
    });
    setTracked(true);
  }, [experiment, identity.visitor.id, tracked]);

  return experiment.params;
}
