import { describe, expect, it } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { BatchLoader } from '../src/infra/batchLoader.ts';
import { KeyedSerialQueue, ScanWriteQueue, Semaphore } from '../src/infra/queue.ts';
import { rateLimit, SlidingWindowLimiter } from '../src/infra/rateLimit.ts';
import { TtlCache } from '../src/infra/ttlCache.ts';

describe('TtlCache', () => {
  it('coalesces in-flight loads and expires entries', async () => {
    let now = 1_000;
    const cache = new TtlCache<string>({ ttlMs: 100, maxSize: 8, now: () => now });
    let loads = 0;
    const load = () => {
      loads += 1;
      return Promise.resolve('ok');
    };
    const [a, b] = await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load)]);
    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(loads).toBe(1);
    expect(cache.get('k')).toBe('ok');
    now = 1_200;
    expect(cache.get('k')).toBeUndefined();
  });

  it('evicts least-recently used when full', () => {
    const cache = new TtlCache<number>({ ttlMs: 60_000, maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });
});

describe('BatchLoader', () => {
  it('batches keys in one loadMany call', async () => {
    const seen: string[][] = [];
    const loader = new BatchLoader<string, string>(
      async (keys) => {
        seen.push([...keys]);
        return new Map(keys.map((k) => [k, k.toUpperCase()]));
      },
      { windowMs: 0, maxBatch: 10 },
    );
    const [a, b, a2] = await Promise.all([
      loader.load('ab'),
      loader.load('cd'),
      loader.load('ab'),
    ]);
    expect(a).toBe('AB');
    expect(b).toBe('CD');
    expect(a2).toBe('AB');
    expect(seen).toHaveLength(1);
    expect(seen[0].sort()).toEqual(['ab', 'cd']);
  });

  it('flushes when maxBatch is reached', async () => {
    let batches = 0;
    const loader = new BatchLoader<number, number>(
      async (keys) => {
        batches += 1;
        return new Map(keys.map((k) => [k, k]));
      },
      { windowMs: 50, maxBatch: 2 },
    );
    const values = await Promise.all([loader.load(1), loader.load(2)]);
    expect(values).toEqual([1, 2]);
    expect(batches).toBe(1);
  });
});

describe('queues', () => {
  it('KeyedSerialQueue runs the same key one at a time', async () => {
    const q = new KeyedSerialQueue();
    const order: string[] = [];
    const slow = q.enqueue('s:1', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('first');
      return 1;
    });
    const next = q.enqueue('s:1', async () => {
      order.push('second');
      return 2;
    });
    expect(await Promise.all([slow, next])).toEqual([1, 2]);
    expect(order).toEqual(['first', 'second']);
  });

  it('Semaphore caps concurrency', async () => {
    const gate = new Semaphore(2);
    let current = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        gate.run(async () => {
          current += 1;
          peak = Math.max(peak, current);
          await new Promise((r) => setTimeout(r, 10));
          current -= 1;
        }),
      ),
    );
    expect(peak).toBe(2);
  });

  it('ScanWriteQueue serializes one student and overlaps others', async () => {
    const writes = new ScanWriteQueue({ concurrency: 4 });
    const events: string[] = [];
    const a = writes.run(1, 10, async () => {
      events.push('a-start');
      await new Promise((r) => setTimeout(r, 25));
      events.push('a-end');
    });
    const a2 = writes.run(1, 10, async () => {
      events.push('a2');
    });
    const b = writes.run(2, 10, async () => {
      events.push('b');
    });
    await Promise.all([a, a2, b]);
    expect(events.indexOf('a-start')).toBeLessThan(events.indexOf('a-end'));
    expect(events.indexOf('a-end')).toBeLessThan(events.indexOf('a2'));
    expect(events).toContain('b');
  });
});

describe('SlidingWindowLimiter', () => {
  it('allows up to max then rejects until the window slides', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter({ windowMs: 100, max: 2, now: () => now });
    expect(limiter.take('u').ok).toBe(true);
    expect(limiter.take('u').ok).toBe(true);
    const blocked = limiter.take('u');
    expect(blocked.ok).toBe(false);
    now = 101;
    expect(limiter.take('u').ok).toBe(true);
  });

  it('rateLimit middleware returns 429', async () => {
    const limiter = new SlidingWindowLimiter({ windowMs: 60_000, max: 2 });
    const app = express();
    app.post('/x', rateLimit({ limiter, key: () => 'k' }), (_req, res) => {
      res.json({ ok: true });
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/x`;
    try {
      expect((await fetch(url, { method: 'POST' })).status).toBe(200);
      expect((await fetch(url, { method: 'POST' })).status).toBe(200);
      const limited = await fetch(url, { method: 'POST' });
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBeTruthy();
      const body = (await limited.json()) as { code: string };
      expect(body.code).toBe('RATE_LIMITED');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
