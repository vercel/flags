import { describe, test, expect } from 'vitest';
import {
  createFlagshipAdapter,
  flagshipAdapter,
  getProviderData,
  Flagship,
} from './index';

describe('index exports', () => {
  test('createFlagshipAdapter is exported', () => {
    expect(createFlagshipAdapter).toBeDefined();
    expect(typeof createFlagshipAdapter).toBe('function');
  });

  test('flagshipAdapter is exported', () => {
    expect(flagshipAdapter).toBeDefined();
    expect(typeof flagshipAdapter).toBe('object');
  });

  test('getProviderData is exported', () => {
    expect(getProviderData).toBeDefined();
    expect(typeof getProviderData).toBe('function');
  });

  test('all exports from @flagship.io/js-sdk are re-exported', () => {
    expect(Flagship).toBeDefined();
  });
});
