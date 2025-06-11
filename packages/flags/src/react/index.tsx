import React, { useEffect, useState } from 'react';
import type { FlagDefinitionsType, FlagValuesType } from '../types';
import { safeJsonStringify } from '../lib/safe-json-stringify';
// the generic type T is not actually used but is great to
// signal what is encrypted
type Encrypted<T> = string;

/**
 * Registers variant definitions with the toolbar
 */
export function FlagDefinitions({
  definitions,
}: {
  definitions: FlagDefinitionsType | Encrypted<FlagDefinitionsType>;
}) {
  return (
    <script
      type="application/json"
      data-flag-definitions
      dangerouslySetInnerHTML={{
        __html: safeJsonStringify(definitions),
      }}
    />
  );
}

/**
 * Registers variant values with the toolbar
 */
export function FlagValues({
  values,
}: {
  values: FlagValuesType | Encrypted<FlagValuesType>;
}) {
  return (
    <script
      type="application/json"
      data-flag-values
      dangerouslySetInnerHTML={{
        __html: safeJsonStringify(values),
      }}
    />
  );
}

/**
 * A placeholder which gets rewritten by Edge Middleware to embed information
 * from Edge Middleware into the page.
 *
 * Render this in your top-level layout(s).
 */
export function FlagBootstrapData() {
  return (
    <script
      data-flag-bootstrap
      // biome-ignore lint/security/noDangerouslySetInnerHtml: will be replaced by HTML Rewriting
      dangerouslySetInnerHTML={{ __html: '' }}
      suppressHydrationWarning
      type="application/json"
    />
  );
}

/**
 * React hook to get the bootstrap data from the page.
 */
export function useBootstrapData<T>(initialData?: T) {
  const [data, setData] = useState<T | undefined>(initialData || undefined);
  useEffect(() => {
    const element = document.querySelector('script[data-flag-bootstrap]');
    if (!element) {
      console.warn(`useBootstrapData: FlagBootstrapData not found on page`);
      return;
    }

    const text = element.textContent;
    setData(text ? JSON.parse(text) : undefined);
  }, []);
  return data;
}
