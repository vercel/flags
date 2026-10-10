import { runtime } from '../runtime';
import type { OverridesOptions } from './reader';

export type { OverridesOptions } from './reader';
export {
  decryptOverrides,
  encryptOverrides,
  type FlagOverrides,
} from './shared-secret';
export type { JsonValue, OverrideRejection } from './types';
export {
  type OverrideProject,
  OverridesError,
  type VercelOverridesOptions,
} from './vercel';

/**
 * Sets which override tokens the SDK accepts. Call it one time, at startup.
 * Usually, you do not need it:
 *
 * - If `FLAGS_SECRET` is set, the SDK accepts the tokens of this shared
 *   secret, as in v4.
 * - Otherwise, on Vercel or locally with a linked project (when `VERCEL` or
 *   `VERCEL_OIDC_TOKEN` is set), the SDK accepts the tokens which Vercel
 *   signs for this project, e.g. from Flags Explorer.
 *
 * Throws if an option is not valid.
 *
 * @example
 * ```ts
 * // Accept signed tokens which are valid for up to one week
 * configureOverrides({ vercel: { maxLifetimeSeconds: 7 * 24 * 60 * 60 } });
 * ```
 */
export function configureOverrides(options: OverridesOptions): void {
  runtime.configureOverrides(options);
}
