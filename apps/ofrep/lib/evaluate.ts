import {
  type DatafileInput,
  evaluate,
  Reason,
  type Value,
} from '@vercel/flags-core';

type Success = {
  key: string;
  value: Value;
  reason: 'STATIC' | 'TARGETING_MATCH' | 'SPLIT' | 'DISABLED' | 'UNKNOWN';
  variant?: string;
};
type Failure = { key: string; errorCode: 'GENERAL'; errorDetails: string };

export function evaluateFlag(
  data: DatafileInput,
  key: string,
  context: Record<string, unknown>,
): Success | Failure {
  try {
    const result = evaluate<Value>({
      definition: data.definitions[key]!,
      environment: data.environment,
      segments: data.segments,
      entities: context,
    });
    if (result.reason === Reason.ERROR) {
      return {
        key,
        errorCode: 'GENERAL',
        errorDetails: 'Flag evaluation failed.',
      };
    }
    // OFREP 0.4.0 permits JSON objects but does not define null or array values.
    if (
      result.value === null ||
      Array.isArray(result.value) ||
      result.value === undefined
    ) {
      return {
        key,
        errorCode: 'GENERAL',
        errorDetails: 'The flag value type is not supported by OFREP.',
      };
    }
    const reason: Success['reason'] =
      result.reason === Reason.PAUSED
        ? 'DISABLED'
        : result.outcomeType === 'split' ||
            result.outcomeType === 'rollout' ||
            result.outcomeType === 'experiment'
          ? 'SPLIT'
          : result.reason === Reason.TARGET_MATCH ||
              result.reason === Reason.RULE_MATCH
            ? 'TARGETING_MATCH'
            : 'UNKNOWN';
    return {
      key,
      value: result.value,
      reason,
      ...(result.variantId !== null ? { variant: result.variantId } : {}),
    };
  } catch {
    return {
      key,
      errorCode: 'GENERAL',
      errorDetails: 'Flag evaluation failed.',
    };
  }
}
