import type { DatafileInput, Metrics } from '../types';

/**
 * Internal origin tracking for how data was obtained.
 * This flows with the data from point of origin through to metrics.
 */
export type DataOrigin = 'stream' | 'poll' | 'bundled' | 'provided' | 'fetched';

/**
 * DatafileInput with origin metadata attached at the point of arrival.
 * Internal only — stripped before returning to consumers.
 */
export type TaggedData = DatafileInput & {
  _origin: DataOrigin;
  /** Successful network arrival of this version */
  _fetchedAt?: number;
};

/**
 * Tags a DatafileInput with metadata.
 */
export function tagData(data: DatafileInput, origin: DataOrigin): TaggedData {
  let fetchedAt: number | undefined;
  if (origin === 'fetched' || origin === 'poll' || origin === 'stream') {
    fetchedAt = Date.now();
  }
  return Object.assign(data, {
    _origin: origin,
    _fetchedAt: fetchedAt,
  }) as TaggedData;
}

/**
 * Maps internal DataOrigin to the public Metrics.source value.
 */
export function originToMetricsSource(origin: DataOrigin): Metrics['source'] {
  switch (origin) {
    case 'stream':
    case 'poll':
    case 'provided':
      return 'in-memory';
    case 'fetched':
      return 'remote';
    case 'bundled':
      return 'embedded';
  }
}
