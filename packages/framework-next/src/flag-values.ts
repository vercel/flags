/**
 * The component `FlagValues`: it writes the values of flags into the page,
 * for Flags Explorer and for the analytics of Vercel. The format is section
 * 11 of the standard of the Flags SDK.
 */

// Through the package name, so that withFlags can replace the module
import {
  type EncryptValuesOptions,
  encryptValues,
} from '@flags-sdk/next/encrypt-values';
import {
  evaluate,
  type FlagDefinition,
  type FlagValuesType,
  serializeFlagValues,
} from 'flags';
import { createElement, type ReactElement, Suspense } from 'react';

export interface FlagValuesProps {
  /**
   * The flags to evaluate. Each flag is evaluated one time for each
   * request, so the page and the component get the same value.
   */
  readonly flags?: readonly FlagDefinition[];
  /**
   * Values which are already known, e.g. of `getPrecomputed`. A value
   * replaces the value of a flag in `flags` with the same key.
   */
  readonly values?: FlagValuesType;
  /**
   * Writes the values without encryption. Each visitor can then read them.
   * The default is `false`.
   */
  readonly plain?: boolean;
  /**
   * Options of `encryptFlagValues`, e.g. `method`. They must be
   * serializable, so `fetch` is not available.
   */
  readonly encryption?: EncryptValuesOptions;
}

/**
 * Writes the values of flags into the page, encrypted by default:
 *
 * ```html
 * <script type="application/json" data-flag-values>…</script>
 * ```
 *
 * Without `FLAGS_SECRET`, the values are encrypted with the public key of
 * Vercel. With `FLAGS_SECRET`, they use the format of v4.
 *
 * It is a server component. It has its own `<Suspense>`, so that it can be
 * in a static part of a page, e.g. in a layout. With only `values`, e.g. of
 * `getPrecomputed`, it does not use the request, so the page can be
 * static, also with Cache Components.
 *
 * @example
 * ```tsx
 * import { FlagValues } from '@flags-sdk/next/flag-values';
 *
 * <FlagValues flags={[summerSale, checkout]} />
 * ```
 */
export function FlagValues(props: FlagValuesProps): ReactElement {
  return createElement(
    Suspense,
    { fallback: null },
    createElement(FlagValuesElement, props),
  );
}

async function FlagValuesElement({
  flags = [],
  values,
  plain = false,
  encryption,
}: FlagValuesProps): Promise<ReactElement | null> {
  const results = flags.length > 0 ? await evaluate(flags) : [];
  const all: FlagValuesType = {};
  flags.forEach((flag, index) => {
    all[flag.key] = results[index] as FlagValuesType[string];
  });
  Object.assign(all, values);

  let data: FlagValuesType | string = all;
  if (!plain) {
    try {
      data = await encryptValues(all, encryption);
    } catch (error) {
      // The flag values are only for tools, so the page does not fail
      warnOnce(error);
      return null;
    }
  }
  return createElement('script', {
    type: 'application/json',
    'data-flag-values': '',
    // biome-ignore lint/security/noDangerouslySetInnerHtml: serializeFlagValues escapes each <, so the content can not end the element
    dangerouslySetInnerHTML: { __html: serializeFlagValues(data) },
  });
}

const warned = new Set<string>();

function warnOnce(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(
    `flags: FlagValues wrote no element, because the values could not be encrypted. ${message}`,
  );
}
