import { describe, expect, it, vi } from 'vitest';
import { BoundedMap } from './bounded-map';

describe('BoundedMap', () => {
  it('stays bounded across overflows without reads or updates changing FIFO order', () => {
    const map = new BoundedMap<string, number>(2);
    expect(map.get('first')).toBeUndefined();
    expect(map.set('first', 1).set('second', 2)).toBe(map);
    expect(map.size).toBe(2);
    expect(map.get('second')).toBe(2);

    expect(map.get('first')).toBe(1);
    map.set('third', 3);
    expect(map.size).toBe(2);
    expect(map.get('first')).toBeUndefined();
    expect(map.get('second')).toBe(2);
    expect(map.get('third')).toBe(3);

    map.set('second', 20);
    expect(map.size).toBe(2);
    expect(map.get('second')).toBe(20);
    map.set('fourth', 4);
    expect(map.size).toBe(2);
    expect(map.get('second')).toBeUndefined();
    expect(map.get('third')).toBe(3);
    expect(map.get('fourth')).toBe(4);
  });

  it('checks the current eviction policy only when an entry is read', () => {
    let cutoff = 10;
    const shouldEvict = vi.fn((value: number) => value < cutoff);
    const map = new BoundedMap<string, number>(3, shouldEvict);
    map.set('version', 10);
    expect(shouldEvict).not.toHaveBeenCalled();
    expect(map.get('version')).toBe(10);
    expect(shouldEvict).toHaveBeenCalledExactlyOnceWith(10, 'version');

    cutoff = 11;
    expect(map.size).toBe(1);
    expect(map.get('version')).toBeUndefined();
    expect(map.size).toBe(0);
    expect(map.get('version')).toBeUndefined();
    expect(shouldEvict).toHaveBeenCalledTimes(2);

    map.set('version', 12);
    expect(map.get('version')).toBe(12);
    expect(map.size).toBe(1);
  });

  it('applies the policy to stored undefined values', () => {
    const shouldEvict = vi.fn(() => true);
    const map = new BoundedMap<undefined, undefined>(1, shouldEvict);
    map.set(undefined, undefined);

    expect(map.get(undefined)).toBeUndefined();
    expect(shouldEvict).toHaveBeenCalledExactlyOnceWith(undefined, undefined);
    expect(map.size).toBe(0);
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
