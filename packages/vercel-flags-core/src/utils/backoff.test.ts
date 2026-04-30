import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJitteredWaitMs, getRetryDelayMs } from './backoff';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getRetryDelayMs', () => {
  it('uses Full Jitter exponential backoff', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    // attempt n → floor(0.5 * baseMs * 2^(n-1)) given default baseMs=250
    expect(getRetryDelayMs(1)).toBe(125); // floor(0.5 * 250)
    expect(getRetryDelayMs(2)).toBe(250); // floor(0.5 * 500)
    expect(getRetryDelayMs(3)).toBe(500); // floor(0.5 * 1000)
    expect(getRetryDelayMs(4)).toBe(1000); // floor(0.5 * 2000)
  });

  it('caps the exponential ceiling at capMs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);

    // attempt 10 with default cap=5000 → ceiling clamped to 5000
    expect(getRetryDelayMs(10)).toBeGreaterThanOrEqual(4990);
    expect(getRetryDelayMs(10)).toBeLessThan(5000);
  });

  it('respects custom baseMs and capMs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(getRetryDelayMs(1, { baseMs: 100 })).toBe(50);
    expect(getRetryDelayMs(5, { baseMs: 100, capMs: 200 })).toBe(100);
  });

  it('treats attempt < 1 as the first attempt', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(getRetryDelayMs(0)).toBe(125);
    expect(getRetryDelayMs(-1)).toBe(125);
  });
});

describe('getJitteredWaitMs', () => {
  it('returns the lower bound when Math.random=0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(getJitteredWaitMs(5000, 0.2)).toBe(4000);
  });

  it('returns the mean when Math.random=0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(getJitteredWaitMs(5000, 0.2)).toBe(5000);
  });

  it('approaches but never reaches the upper bound', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    const value = getJitteredWaitMs(5000, 0.2);
    expect(value).toBeGreaterThanOrEqual(5999);
    expect(value).toBeLessThan(6000);
  });

  it('returns baseMs when ratio is 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(getJitteredWaitMs(5000, 0)).toBe(5000);
  });
});
