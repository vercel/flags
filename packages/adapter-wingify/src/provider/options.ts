import type { FlagOptionType } from 'flags';
import type { IWingifyClient } from 'wingify-fme-node-sdk';

type FeatureModel = ReturnType<
  IWingifyClient['settings']['getFeatures']
>[number];

/** Longest JSON label shown in an Explorer dropdown before it gets cut with `...`. */
const MAX_JSON_LABEL_LENGTH = 60;

/** One variable key/value pair read from a Wingify variation. */
type FeatureVariableEntry = {
  key?: string;
  value: unknown;
};

/**
 * Builds an Explorer / Flags SDK key for one variable on a Wingify feature.
 *
 * @param featureKey - Wingify feature key (e.g. `checkoutFlow`).
 * @param variableName - Variable name on that feature (e.g. `discount`).
 * @returns Composite key in `featureKey:variableName` form.
 */
export function wingifyVariableExplorerKey(
  featureKey: string,
  variableName: string,
): string {
  // Keep feature and variable in one key so Explorer rows stay unique
  return `${featureKey}:${variableName}`;
}

/**
 * Creates a stable string used to dedupe Explorer option values.
 *
 * @param optionValue - Raw option value (string, number, object, etc.).
 * @returns The value itself when string; otherwise `JSON.stringify(value)`.
 */
function createOptionDedupeKey(optionValue: unknown): string {
  // Strings are fine as-is; everything else becomes JSON so we can compare safely
  return typeof optionValue === 'string'
    ? optionValue
    : JSON.stringify(optionValue);
}

/**
 * Reads key/value from a Wingify variable model or plain object.
 *
 * @param variable - SDK `VariableModel` (getters) or a plain `{ key, value }` record.
 * @returns Normalized `{ key, value }`; either field may be undefined.
 */
function readVariableKeyAndValue(variable: unknown): {
  key?: string;
  value?: unknown;
} {
  const variableRecord = variable as {
    getKey?: () => string;
    getValue?: () => unknown;
    key?: string;
    value?: unknown;
  };

  // SDK models use getters; plain objects just have key/value fields
  if (typeof variableRecord.getKey === 'function') {
    return { key: variableRecord.getKey(), value: variableRecord.getValue?.() };
  }
  return { key: variableRecord.key, value: variableRecord.value };
}

/**
 * Formats a short label for a Flags Explorer override option.
 *
 * @param optionValue - Option value to label (boolean, number, string, JSON object, or other).
 * @returns Human-readable label such as `Disabled`, `40`, the trimmed string, or shortened JSON.
 */
function formatExplorerOptionLabel(optionValue: unknown): string {
  if (optionValue === false) return 'Disabled';
  if (optionValue === true) return 'Enabled';
  if (typeof optionValue === 'number') return String(optionValue);

  // Trim strings so empty values still get a visible label
  if (typeof optionValue === 'string') {
    const trimmedValue = optionValue.trim();
    return trimmedValue.length > 0 ? trimmedValue : '(empty)';
  }

  // Show JSON variables as text, cut short so the dropdown stays readable
  if (typeof optionValue === 'object' && optionValue !== null) {
    const jsonText = JSON.stringify(optionValue);
    return jsonText.length > MAX_JSON_LABEL_LENGTH
      ? `${jsonText.slice(0, MAX_JSON_LABEL_LENGTH - 3)}...`
      : jsonText;
  }
  return String(optionValue);
}

/**
 * Collects all variable key/value pairs from a feature's linked campaigns.
 *
 * @param feature - Wingify feature from `settings.getFeatures()`.
 * @returns Flat list of variables found on every variation (skips null/undefined values).
 */
function collectFeatureVariableEntries(
  feature: FeatureModel,
): FeatureVariableEntry[] {
  const variableEntries: FeatureVariableEntry[] = [];

  // Walk rules → variations → variables and flatten into one list
  for (const campaign of feature.getRulesLinkedCampaign()) {
    for (const variation of campaign.getVariations()) {
      for (const variable of variation.getVariables()) {
        const { key, value } = readVariableKeyAndValue(variable);
        // Skip empty slots; only keep real values
        if (value === undefined || value === null) continue;
        variableEntries.push({ key, value });
      }
    }
  }
  return variableEntries;
}

/**
 * Lists distinct variable names configured on a Wingify feature.
 *
 * @param feature - Wingify feature from `settings.getFeatures()`.
 * @returns Sorted unique variable keys (e.g. `cta`, `discount`).
 */
export function listFeatureVariableNames(feature: FeatureModel): string[] {
  const distinctVariableNames = new Set<string>();

  // Same variable can appear on many variations — keep each name once
  for (const { key } of collectFeatureVariableEntries(feature)) {
    if (key) distinctVariableNames.add(key);
  }
  return [...distinctVariableNames].sort((leftName, rightName) =>
    leftName.localeCompare(rightName),
  );
}

/**
 * Builds Disabled / Enabled options for a boolean Explorer flag.
 *
 * @returns Two options: `false` (Disabled) and `true` (Enabled).
 */
export function buildDisabledEnabledOptions(): FlagOptionType[] {
  return [
    { value: false, label: 'Disabled' },
    { value: true, label: 'Enabled' },
  ];
}

/**
 * Builds Explorer options from distinct values of one variable across variations.
 *
 * @param feature - Wingify feature that owns the variable.
 * @param variableName - Variable key to collect values for (e.g. `discount`).
 * @returns Unique value options for the dropdown (falls back to on/off if none found).
 */
export function buildVariableValueOptions(
  feature: FeatureModel,
  variableName: string,
): FlagOptionType[] {
  const explorerOptions: FlagOptionType[] = [];
  const seenOptionDedupeKeys = new Set<string>();

  // Pull only this variable's values from every variation
  for (const { key, value } of collectFeatureVariableEntries(feature)) {
    if (key !== variableName) continue;
    const optionDedupeKey = createOptionDedupeKey(value);

    // Skip duplicates so the dropdown stays clean
    if (seenOptionDedupeKeys.has(optionDedupeKey)) continue;
    seenOptionDedupeKeys.add(optionDedupeKey);
    explorerOptions.push({
      value,
      label: formatExplorerOptionLabel(value),
    });
  }

  if (explorerOptions.length === 0) {
    return buildDisabledEnabledOptions();
  }

  return explorerOptions;
}
