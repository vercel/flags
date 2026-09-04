/**
 * Decides whether locally available flag definitions are already current for
 * the request being served, based on the config version the request was
 * routed to (see `utils/edge-config-versions.ts`).
 *
 * When they are, the controller can finish initialization right away instead
 * of waiting for a stream confirmation or a first poll, while updates keep
 * arriving in the background.
 */

import {
  EDGE_CONFIG_VERSIONS_HEADER,
  flagsConfigVersionKey,
  parseConfigVersion,
  selectConfigVersion,
} from '../utils/edge-config-versions';
import { getRequestContext } from '../utils/request-context';

/**
 * Low cardinality outcome of the routed config version check.
 *
 * Only describes the comparison — never carries project ids, store names or
 * header values. `undefined` (no outcome) is used whenever no routed version
 * applies to this project, which is the case for every request that is not
 * routed through a config version.
 */
export type RoutedInitOutcome =
  /** Local definitions are at or ahead of the routed version. */
  | 'immediate'
  /** The routed version is newer than the local definitions. */
  | 'behind'
  /** The routed version is malformed or outside the safe integer range. */
  | 'invalid'
  /** The routed key is present more than once. */
  | 'duplicate'
  /** The local definitions carry no usable `configUpdatedAt`. */
  | 'unknown-local';

export type RoutedInitDecision = {
  /**
   * True only when the local definitions are provably current for this
   * request. False keeps the existing initialization behavior.
   */
  immediate: boolean;
  /** Outcome for metrics; `undefined` when no routed version applies. */
  outcome: RoutedInitOutcome | undefined;
};

const NO_DECISION: RoutedInitDecision = {
  immediate: false,
  outcome: undefined,
};

/**
 * Parses a datafile `configUpdatedAt` into a timestamp that can be compared
 * against a routed config version. Numbers and numeric strings are accepted;
 * missing, malformed and unsafe values are rejected.
 */
function parseLocalTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === 'string') {
    return parseConfigVersion(value.trim());
  }
  return undefined;
}

/**
 * Compares the locally loaded definitions against the config version this
 * request was routed to.
 *
 * Returns no decision — preserving the existing initialization behavior — when
 * there is no request context, no project id, or no exact entry for this
 * project in the header.
 */
export function decideRoutedInit(data: {
  projectId: unknown;
  configUpdatedAt: unknown;
}): RoutedInitDecision {
  try {
    const projectId = data.projectId;
    if (typeof projectId !== 'string' || projectId === '') return NO_DECISION;

    const { ctx, headers } = getRequestContext();
    if (!ctx || !headers) return NO_DECISION;

    const routed = selectConfigVersion(
      headers[EDGE_CONFIG_VERSIONS_HEADER],
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
