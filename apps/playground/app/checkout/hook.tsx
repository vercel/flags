import { track } from '@vercel/analytics/next';
import { useEffect, useRef } from 'react';
import type { CheckoutExperiment, Entity } from '@/types';

export function useExperiment(
  experiment: CheckoutExperiment,
  identity: Entity,
) {
  const tracked = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: values are server-provided and stable; tracked.current prevents re-firing
  useEffect(() => {
    if (tracked.current) return;

    const id = setTimeout(() => {
      if (tracked.current) return;
      tracked.current = true;

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
