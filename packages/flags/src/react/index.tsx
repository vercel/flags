'use client';

import React from 'react';
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

const emptyValues: FlagValuesType = {};
const FlagContext = React.createContext<FlagValuesType>(emptyValues);

export function FlagContextProvider<T>({
  children,
  values,
}: {
  children: React.ReactNode;
  values: FlagValuesType;
}) {
  return <FlagContext.Provider value={values}>{children}</FlagContext.Provider>;
}

export function useFlagContext<T>(): T;
export function useFlagContext<T>(key: string): T;
export function useFlagContext<T>(key?: string): T {
  const values = React.useContext(FlagContext);

  if (values === emptyValues) {
    throw new Error('FlagContextProvider not found');
  }

  return typeof key === 'string' ? (values[key] as T) : (values as T);
}
