export type BatchLoaderOptions = {
  /** 0 flushes on the next microtask. */
  windowMs: number;
  maxBatch: number;
};

type Waiter<V> = {
  promise: Promise<V>;
  resolve: (value: V) => void;
  reject: (err: unknown) => void;
};

/**
 * Collects keys for a short window and loads them in one call.
 * Duplicate keys in the same window share a single promise.
 */
export class BatchLoader<K, V> {
  private readonly windowMs: number;
  private readonly maxBatch: number;
  private readonly loadMany: (keys: K[]) => Promise<Map<K, V>>;
  private pending = new Map<K, Waiter<V>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scheduled = false;

  constructor(loadMany: (keys: K[]) => Promise<Map<K, V>>, opts: BatchLoaderOptions) {
    this.loadMany = loadMany;
    this.windowMs = Math.max(0, opts.windowMs);
    this.maxBatch = Math.max(1, opts.maxBatch);
  }

  load(key: K): Promise<V> {
    const existing = this.pending.get(key);
    if (existing) return existing.promise;

    let resolve!: (value: V) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<V>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.pending.set(key, { promise, resolve, reject });

    if (this.pending.size >= this.maxBatch) {
      this.flush();
      return promise;
    }
    this.schedule();
    return promise;
  }

  flush(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduled = false;
    const batch = this.pending;
    this.pending = new Map();
    if (batch.size === 0) return;

    const keys = [...batch.keys()];
    void this.loadMany(keys)
      .then((found) => {
        for (const [key, waiter] of batch) {
          if (found.has(key)) waiter.resolve(found.get(key) as V);
          else waiter.reject(new Error('Batch loader missed key'));
        }
      })
      .catch((err: unknown) => {
        for (const waiter of batch.values()) waiter.reject(err);
      });
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    if (this.windowMs <= 0) {
      queueMicrotask(() => this.flush());
      return;
    }
    this.timer = setTimeout(() => this.flush(), this.windowMs);
  }
}
