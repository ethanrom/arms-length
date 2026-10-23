/** A least-recently-used map bounded by total weight (bytes, for the frame store). The newest entry always stays. */
export class LruCache<T> {
  private readonly map = new Map<string, T>();
  private total = 0;

  constructor(
    private readonly maxWeight: number,
    private readonly weigh: (value: T) => number,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get weight(): number {
    return this.total;
  }

  /** Reading an entry makes it the newest. */
  get(key: string): T | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /** The newest entry whose key starts with `prefix`, without changing the order. */
  findByPrefix(prefix: string): T | undefined {
    let found: T | undefined;
    for (const [k, v] of this.map) if (k.startsWith(`${prefix}|`)) found = v;
    return found;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: T): void {
    const old = this.map.get(key);
    if (old !== undefined) {
      this.total -= this.weigh(old);
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.total += this.weigh(value);
    for (const [k, v] of this.map) {
      if (this.total <= this.maxWeight || this.map.size <= 1) break;
      this.map.delete(k);
      this.total -= this.weigh(v);
    }
  }
}
