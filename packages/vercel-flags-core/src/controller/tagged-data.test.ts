import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatafileInput } from '../types';
import { tagData } from './tagged-data';

const NOW = 1_700_000_000_000;

const datafile: DatafileInput = {
  projectId: 'prj_test',
  environment: 'production',
  definitions: {},
  configUpdatedAt: NOW - 60_000,
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tagData', () => {
  it.each([
    'fetched',
    'poll',
    'stream',
  ] as const)('records each %s arrival without mutating the input', (origin) => {
    const input = Object.freeze({ ...datafile, fetchedAt: NOW - 5_000 });
    const tagged = tagData(input, origin);

    expect(tagged).not.toBe(input);
    expect(tagged).toEqual({ ...datafile, _origin: origin, fetchedAt: NOW });
    expect(tagged).not.toHaveProperty('_lastSeen');

    vi.setSystemTime(NOW + 1_000);
    expect(tagData(input, origin).fetchedAt).toBe(NOW + 1_000);
    expect(tagged.fetchedAt).toBe(NOW);
    expect(input.fetchedAt).toBe(NOW - 5_000);
    expect(tagged.configUpdatedAt).toBe(datafile.configUpdatedAt);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('keeps %s freshness unknown, including after a fetch', (origin) => {
    const input = { ...datafile };
    expect(tagData(input, origin).fetchedAt).toBeUndefined();
    tagData(input, 'fetched');
    vi.setSystemTime(NOW + 1_000);
    const tagged = tagData(input, origin);

    expect(tagged).not.toBe(input);
    expect(tagged).toEqual({
      ...datafile,
      _origin: origin,
    });
    expect(tagged).not.toHaveProperty('_lastSeen');
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('preserves %s timestamps, including zero, without resetting age', (origin) => {
    for (const fetchedAt of [0, NOW - 30_000]) {
      const input = Object.freeze({ ...datafile, fetchedAt });
      vi.setSystemTime(NOW + 10_000);
      expect(tagData(input, origin)).toEqual({ ...input, _origin: origin });
      expect(input.fetchedAt).toBe(fetchedAt);
    }
  });

  it.each([
    undefined,
    NaN,
    Infinity,
    -Infinity,
    -1,
    '1700000000000',
  ])('treats invalid or missing fetchedAt=%s as unknown', (fetchedAt) => {
    const input = { ...datafile, fetchedAt } as DatafileInput;
    expect(tagData(input, 'provided')).not.toHaveProperty('fetchedAt');
    expect(tagData(input, 'bundled')).not.toHaveProperty('fetchedAt');
  });
});
