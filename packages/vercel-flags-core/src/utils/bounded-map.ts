/**
 * A size-limited map that evicts the oldest inserted key when full.
 * Reading or updating a key does not change its insertion order.
 */
export class BoundedMap<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new RangeError('maxSize must be a positive integer');
    }
  }

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): this {
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      this.map.delete(this.map.keys().next().value!);
    }
    return this;
  }

  clear(): void {
    this.map.clear();
  }
}
