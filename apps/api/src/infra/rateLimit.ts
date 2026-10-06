import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { tooManyRequests } from '../utils/errors.ts';

export type SlidingWindowOptions = {
  windowMs: number;
  max: number;
  now?: () => number;
};

export type RateLimitDecision =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number; remaining: 0 };

/** Sliding-window counter stored in process memory. */
export class SlidingWindowLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();
  private sweeps = 0;

  constructor(opts: SlidingWindowOptions) {
    this.windowMs = Math.max(1, opts.windowMs);
    this.max = Math.max(1, opts.max);
    this.now = opts.now ?? Date.now;
  }

  take(key: string): RateLimitDecision {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length >= this.max) {
      this.hits.set(key, kept);
      const retryAfterMs = kept[0] + this.windowMs - t;
      return { ok: false, retryAfterMs: Math.max(1, retryAfterMs), remaining: 0 };
    }
    kept.push(t);
    this.hits.set(key, kept);
    this.maybeSweep(t);
    return { ok: true, remaining: this.max - kept.length };
  }

  reset(): void {
    this.hits.clear();
  }

  private maybeSweep(now: number): void {
    this.sweeps += 1;
    if (this.sweeps % 64 !== 0) return;
    const cutoff = now - this.windowMs;
    for (const [key, stamps] of this.hits) {
      const kept = stamps.filter((at) => at > cutoff);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimit(opts: {
  limiter: SlidingWindowLimiter;
  key: (req: Request) => string;
  enabled?: () => boolean;
}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (opts.enabled && !opts.enabled()) {
      next();
      return;
    }
    const decision = opts.limiter.take(opts.key(req));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    if (decision.ok) {
      next();
      return;
    }
    const retryAfter = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
    const err = tooManyRequests(retryAfter);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json(err.toBody());
  };
}
