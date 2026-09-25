import type { FlagsmithValue } from '@flagsmith/nodejs';

type FlagState = {
  flags: Record<string, { enabled: boolean; value: FlagsmithValue }>;
};

// Mock flag states for testing
export const stringFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 'raw-string-value' } },
};

export const numberFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 42 } },
};

export const booleanTrueFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: true } },
};

export const booleanFalseFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: false } },
};

export const emptyStringFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: '' } },
};

export const nullFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: null } },
};

export const nanFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: NaN } },
};

export const stringNumberFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: '123' } },
};

export const stringInvalidNumberFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 'not-a-number' } },
};

export const stringTrueFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 'true' } },
};

export const stringFalseFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 'false' } },
};

export const numberOneFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 1 } },
};

export const numberZeroFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 0 } },
};

export const stringInvalidBooleanFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 'invalid' } },
};

export const numberInvalidBooleanFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 42 } },
};

export const emptyFlags: FlagState = {
  flags: {},
};

export const disabledStringFlag: FlagState = {
  flags: { 'test-flag': { enabled: false, value: 'test-value' } },
};

export const disabledNumberFlag: FlagState = {
  flags: { 'test-flag': { enabled: false, value: 42 } },
};

export const someValueFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 'some-value' } },
};

export const testValueFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 'test-value' } },
};

export const nonBooleanValueEnabledFlag: FlagState = {
  flags: { 'test-flag': { enabled: true, value: 'some-random-string' } },
};

export const nonBooleanValueDisabledFlag: FlagState = {
  flags: { 'test-flag': { enabled: false, value: 'some-random-string' } },
};
