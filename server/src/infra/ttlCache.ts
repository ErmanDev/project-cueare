export type TtlCacheOptions = {
  ttlMs: number;
  maxSize: number;
  now?: () => number;
};

type Entry<V> = {
  value: V;
  expiresAt: number;
};

/** In-process TTL cache with LRU eviction and in-flight coalescing. */
export class TtlCache<V> {
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly now: () => number;
  private readonly store = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();

  constructor(opts: TtlCacheOptions) {
    this.ttlMs = Math.max(0, opts.ttlMs);
    this.maxSize = Math.max(1, opts.maxSize);
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.store.size;
  }

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs = this.ttlMs): void {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
    this.evict();
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deletePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  async getOrLoad(
    key: string,
    load: () => Promise<V>,
    ttlMs = this.ttlMs,
  ): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const started = load().then((value) => {
      this.set(key, value, ttlMs);
      return value;
    });
    this.inflight.set(key, started);
    try {
      return await started;
    } finally {
      this.inflight.delete(key);
    }
  }

  private evict(): void {
    const now = this.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
    while (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest == null) break;
      this.store.delete(oldest);
    }
  }
}
