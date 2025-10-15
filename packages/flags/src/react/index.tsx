// biome-ignore lint/correctness/noUnusedImports: needed in scope
import React from "react";
import { safeJsonStringify } from "../lib/safe-json-stringify";
import type { FlagDefinitionsType, FlagValuesType } from "../types";

// the generic type T is not actually used but is great to
// signal what is encrypted
// biome-ignore lint/correctness/noUnusedVariables: generic necessary so the payload can be tagged
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
      // biome-ignore lint/security/noDangerouslySetInnerHtml: necessary here
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
      // biome-ignore lint/security/noDangerouslySetInnerHtml: necessary  in this case
      dangerouslySetInnerHTML={{
        __html: safeJsonStringify(values),
      }}
    />
  );
}
