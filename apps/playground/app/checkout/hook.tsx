import { track } from '@vercel/analytics/next';
import { useEffect } from 'react';
import type { CheckoutExperiment, Entity } from '@/types';

export function useExperiment(
  experiment: CheckoutExperiment,
  identity: Entity,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: values are server-provided and stable
  useEffect(() => {
    const id = setTimeout(() => {
      track('exposure', {
        unitId: identity.visitor.id,
        unitType: experiment.unitType,
        experimentId: experiment.experimentId,
        variantId: experiment.variantId,
      });
    }, 0);

    return () => clearTimeout(id);
  }, []);

  return experiment.params;
}
