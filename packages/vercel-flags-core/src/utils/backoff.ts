/**
 * Backoff and jitter utilities for retry loops.
 *
 * The functions here are intentionally generic so they can be used wherever
 * the SDK retries an operation. They use `Math.random` directly; mock it from
 * tests if you need deterministic behaviour.
 */

const DEFAULT_BASE_MS = 250;
const DEFAULT_CAP_MS = 5000;

export interface RetryDelayOptions {
  /**
   * The base delay in milliseconds. With Full Jitter, the first failed attempt
   * sleeps in `[0, baseMs)`, the second in `[0, baseMs * 2)`, etc.
   * Defaults to 250ms.
   */
  baseMs?: number;
  /**
   * Hard ceiling on the computed delay. Defaults to 5000ms.
   */
  capMs?: number;
}

/**
 * Returns the sleep duration before the next retry attempt using AWS-style
 * "Full Jitter" exponential backoff.
 *
 * @param attempt The 1-indexed attempt number that just failed.
 * @see https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter
 */
export function getRetryDelayMs(
  attempt: number,
  options: RetryDelayOptions = {},
): number {
  const baseMs = options.baseMs ?? DEFAULT_BASE_MS;
  const capMs = options.capMs ?? DEFAULT_CAP_MS;

  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(Math.random() * ceiling);
}

/**
 * Returns `baseMs` perturbed by `±ratio` of itself, drawn uniformly from
 * `[baseMs * (1 - ratio), baseMs * (1 + ratio))`. Useful for desynchronizing
 * fixed-interval timers across independent processes.
 *
 * @param baseMs The target mean wait, in milliseconds.
 * @param ratio The fractional jitter to apply on each side, in `[0, 1)`.
 */
export function getJitteredWaitMs(baseMs: number, ratio: number): number {
  const min = baseMs * (1 - ratio);
  const span = baseMs * 2 * ratio;
  return Math.floor(min + Math.random() * span);
}
