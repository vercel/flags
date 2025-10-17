import type { IState } from 'flagsmith';

// Mock flag states for testing
export const stringFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 'raw-string-value' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const numberFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 42 } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const booleanTrueFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: true } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const booleanFalseFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: false } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const emptyStringFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: '' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const nullFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: null } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const nanFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: NaN } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const stringNumberFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: '123' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const stringInvalidNumberFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 'not-a-number' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const stringTrueFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 'true' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const stringFalseFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 'false' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const numberOneFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 1 } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const numberZeroFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 0 } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const stringInvalidBooleanFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 'invalid' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const numberInvalidBooleanFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 42 } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const emptyFlags: IState<string> = {
  flags: {},
  api: 'https://api.flagsmith.com/api/v1/',
};

export const disabledStringFlag: IState<string> = {
  flags: { 'test-flag': { enabled: false, value: 'test-value' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const disabledNumberFlag: IState<string> = {
  flags: { 'test-flag': { enabled: false, value: 42 } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const someValueFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 'some-value' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const testValueFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 'test-value' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const nonBooleanValueEnabledFlag: IState<string> = {
  flags: { 'test-flag': { enabled: true, value: 'some-random-string' } },
  api: 'https://api.flagsmith.com/api/v1/',
};

export const nonBooleanValueDisabledFlag: IState<string> = {
  flags: { 'test-flag': { enabled: false, value: 'some-random-string' } },
  api: 'https://api.flagsmith.com/api/v1/',
};
