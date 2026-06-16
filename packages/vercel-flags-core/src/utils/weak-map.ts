export class BetterWeakMap<K, V> {
  private _values: V[] = [];
  private _keys: K[] = [];

  set(key: K, value: V): void {
    this._keys.push(key);
    this._values.push(value);
  }

  values(): V[] {
    return this._values;
  }

  has(key: K): boolean {
    return this._keys.includes(key);
  }

  keys(): K[] {
    return this._keys;
  }

  clear() {
    this._values = [];
    this._keys = [];
  }
}
