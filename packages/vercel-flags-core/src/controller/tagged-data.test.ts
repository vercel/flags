import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatafileInput } from '../types';
import { tagData } from './tagged-data';

const NOW = 1_700_000_000_000;

function datafile(): DatafileInput {
  return {
    projectId: 'prj_test',
    environment: 'production',
    definitions: {},
    configUpdatedAt: NOW - 60_000,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tagData', () => {
  it.each([
    'fetched',
    'poll',
    'stream',
  ] as const)('tags %s data in place with its arrival time', (origin) => {
    const input = datafile();
    const original = structuredClone(input);
    const tagged = tagData(input, origin);

    expect(tagged).toBe(input);
    expect(tagged).toEqual({ ...original, _origin: origin, _fetchedAt: NOW });
    expect(tagged).not.toHaveProperty('_lastSeen');
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('leaves %s freshness unknown even when retagging a fetched object', (origin) => {
    const input = datafile();
    const original = structuredClone(input);
    tagData(input, 'fetched');
    vi.setSystemTime(NOW + 1_000);
    const tagged = tagData(input, origin);

    expect(tagged).toBe(input);
    expect(tagged).toEqual({
      ...original,
      _origin: origin,
      _fetchedAt: undefined,
    });
    expect(tagged).not.toHaveProperty('_lastSeen');
  });

  it('renews the arrival timestamp when the same object is fetched again', () => {
    const input = datafile();
    tagData(input, 'fetched');
    vi.setSystemTime(NOW + 10_001);
    const tagged = tagData(input, 'poll');

    expect(tagged).toBe(input);
    expect(tagged._origin).toBe('poll');
    expect(tagged._fetchedAt).toBe(NOW + 10_001);
    expect(tagged.configUpdatedAt).toBe(NOW - 60_000);
  });
});
