import { getRequestContext } from '../utils/request-context';
import {
  FALLBACK_VERSION_HEADER,
  flagsConfigVersionKey,
  parseConfigVersion,
  selectConfigVersion,
  VERSION_HEADER,
} from '../utils/version-header';

/** Low-cardinality metric outcome; never includes ids or header values. */
export type RoutedInitOutcome =
  | 'immediate'
  | 'behind'
  | 'invalid'
  | 'duplicate'
  | 'unknown-local';

export type RoutedInitDecision = {
  immediate: boolean;
  /** Omitted when no routed version applies to this project. */
  outcome: RoutedInitOutcome | undefined;
};

const NO_DECISION: RoutedInitDecision = {
  immediate: false,
  outcome: undefined,
};

function parseLocalTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === 'string') {
    return parseConfigVersion(value.trim());
  }
  return undefined;
}

/** Skips the init wait only when local definitions cover the routed version. */
export function decideRoutedInit(data: {
  projectId: unknown;
  configUpdatedAt: unknown;
}): RoutedInitDecision {
  try {
    const projectId = data.projectId;
    if (typeof projectId !== 'string' || projectId === '') return NO_DECISION;

    const { ctx, headers } = getRequestContext();
    if (!ctx || !headers) return NO_DECISION;

    // A present primary header is authoritative, even if its entry is unusable.
    const routed = selectConfigVersion(
      headers[VERSION_HEADER] ?? headers[FALLBACK_VERSION_HEADER],
      flagsConfigVersionKey(projectId),
    );

    switch (routed.status) {
      case 'not-found':
        return NO_DECISION;
      case 'invalid':
        return { immediate: false, outcome: 'invalid' };
      case 'duplicate':
        return { immediate: false, outcome: 'duplicate' };
      case 'found':
        break;
    }

    const local = parseLocalTimestamp(data.configUpdatedAt);
    if (local === undefined) {
      return { immediate: false, outcome: 'unknown-local' };
    }

    return local >= routed.version
      ? { immediate: true, outcome: 'immediate' }
      : { immediate: false, outcome: 'behind' };
  } catch {
    // Never let the check itself break initialization.
    return NO_DECISION;
  }
}
