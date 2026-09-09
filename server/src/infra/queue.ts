/** Limits how many tasks run at once (scan writes vs. the Postgres pool). */
export class Semaphore {
  private inUse = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly permits: number) {
    if (permits < 1) throw new Error('Semaphore permits must be >= 1');
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.inUse < this.permits) {
      this.inUse += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.inUse += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.inUse -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

/** One-at-a-time per key; different keys run independently. */
export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    const tail = next.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.finally(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}

export class ScanWriteQueue {
  private readonly keyed: KeyedSerialQueue;
  private readonly gate: Semaphore;

  constructor(opts: { concurrency?: number; keyed?: KeyedSerialQueue; gate?: Semaphore } = {}) {
    this.keyed = opts.keyed ?? new KeyedSerialQueue();
    this.gate = opts.gate ?? new Semaphore(opts.concurrency ?? 8);
  }

  run<T>(studentId: number, sessionWindowId: number, task: () => Promise<T>): Promise<T> {
    return this.keyed.enqueue(`${studentId}:${sessionWindowId}`, () => this.gate.run(task));
  }
}
