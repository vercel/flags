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
  ] as const)('tags %s data without mutating the input', (origin) => {
    const input = { ...datafile };
    const tagged = tagData(input, origin);

    expect(tagged).not.toBe(input);
    expect(tagged).toEqual({ ...datafile, _origin: origin, _fetchedAt: NOW });
    expect(tagged).not.toHaveProperty('_lastSeen');

    vi.setSystemTime(NOW + 1_000);
    expect(tagData(input, origin)._fetchedAt).toBe(NOW + 1_000);
    expect(tagged._fetchedAt).toBe(NOW);
    expect(tagged.configUpdatedAt).toBe(datafile.configUpdatedAt);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('keeps %s freshness unknown, including after a fetch', (origin) => {
    const input = { ...datafile };
    expect(tagData(input, origin)._fetchedAt).toBeUndefined();
    tagData(input, 'fetched');
    vi.setSystemTime(NOW + 1_000);
    const tagged = tagData(input, origin);

    expect(tagged).not.toBe(input);
    expect(tagged).toEqual({
      ...datafile,
      _origin: origin,
      _fetchedAt: undefined,
    });
    expect(tagged).not.toHaveProperty('_lastSeen');
  });
});
