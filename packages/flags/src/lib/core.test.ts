import { describe, it, expect } from 'vitest';
import { core } from './core';

describe('core', () => {
  it('should work', () => {
    expect(typeof core).toBe('function');
  });
});
