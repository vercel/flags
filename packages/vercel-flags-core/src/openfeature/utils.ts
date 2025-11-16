import {
  type ResolutionReason,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import { ResolutionReason as Reason } from '../types';

export function mapReason(reason: Reason): ResolutionReason {
  switch (reason) {
    case Reason.ERROR:
      return StandardResolutionReasons.ERROR;
    case Reason.PAUSED:
      return StandardResolutionReasons.STATIC;
    case Reason.FALLTHROUGH:
      return StandardResolutionReasons.DEFAULT;
    case Reason.TARGET_MATCH:
    case Reason.RULE_MATCH:
      return StandardResolutionReasons.TARGETING_MATCH;
    default:
      return StandardResolutionReasons.UNKNOWN;
  }
}
