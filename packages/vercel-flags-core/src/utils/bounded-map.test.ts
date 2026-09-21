import { describe, expect, it } from 'vitest';
import { BoundedMap } from './bounded-map';

describe('BoundedMap', () => {
  it('stores values up to its capacity', () => {
    const map = new BoundedMap<number, number>(10);
    expect(map.get(0)).toBeUndefined();
    for (let key = 0; key < 10; key++) {
      expect(map.set(key, key * 100)).toBe(map);
    }

    expect(map.size).toBe(10);
    for (let key = 0; key < 10; key++) {
      expect(map.get(key)).toBe(key * 100);
    }
  });

  it('evicts the oldest inserted key on each overflow', () => {
    const map = new BoundedMap<number, number>(10);
    for (let key = 0; key < 12; key++) {
      map.set(key, key);
      expect(map.size).toBe(Math.min(key + 1, 10));
    }

    expect(map.get(0)).toBeUndefined();
    expect(map.get(1)).toBeUndefined();
    for (let key = 2; key < 12; key++) {
      expect(map.get(key)).toBe(key);
    }
  });

  it('updates values without growing the map or changing eviction order', () => {
    const map = new BoundedMap<string, number>(2);
    map.set('first', 1).set('second', 2);
    map.set('first', 3);

    expect(map.size).toBe(2);
    expect(map.get('first')).toBe(3);
    expect(map.get('second')).toBe(2);
    map.set('third', 4);
    expect(map.size).toBe(2);
    expect(map.get('first')).toBeUndefined();
    expect(map.get('second')).toBe(2);
    expect(map.get('third')).toBe(4);
  });

  it('does not change eviction order when reading an entry', () => {
    const map = new BoundedMap<string, number>(2);
    map.set('first', 1).set('second', 2);
    expect(map.get('first')).toBe(1);
    map.set('third', 3);

    expect(map.get('first')).toBeUndefined();
    expect(map.get('second')).toBe(2);
    expect(map.get('third')).toBe(3);
  });

  it('clears entries and can be reused', () => {
    const map = new BoundedMap<number, number>(1);
    map.set(1, 10);
    map.clear();

    expect(map.size).toBe(0);
    expect(map.get(1)).toBeUndefined();
    map.set(2, 20).set(3, 30);
    expect(map.size).toBe(1);
    expect(map.get(2)).toBeUndefined();
    expect(map.get(3)).toBe(30);
  });

  it('supports undefined keys', () => {
    const map = new BoundedMap<string | undefined, number>(1);
    map.set(undefined, 1);
    expect(map.get(undefined)).toBe(1);
    map.set('next', 2);

    expect(map.size).toBe(1);
    expect(map.get(undefined)).toBeUndefined();
    expect(map.get('next')).toBe(2);
  });

  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
  ])('rejects invalid capacity %s', (maxSize) => {
    expect(() => new BoundedMap(maxSize)).toThrow(RangeError);
  });
});
