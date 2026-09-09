import type { Request, RequestHandler } from 'express';

import type { RateLimitTuning } from '../config.ts';
import { tooManyRequests } from '../utils/errors.ts';
import { clientIp, rateLimit, SlidingWindowLimiter } from './rateLimit.ts';

export type HttpGuards = {
  loginIp: SlidingWindowLimiter;
  loginUser: SlidingWindowLimiter;
  scanPreview: SlidingWindowLimiter;
  scanWrite: SlidingWindowLimiter;
};

export function createHttpGuards(tuning: RateLimitTuning): HttpGuards {
  return {
    loginIp: new SlidingWindowLimiter({
      windowMs: tuning.loginWindowMs,
      max: tuning.loginMax,
    }),
    loginUser: new SlidingWindowLimiter({
      windowMs: tuning.loginWindowMs,
      max: tuning.loginMax,
    }),
    scanPreview: new SlidingWindowLimiter({
      windowMs: tuning.scanWindowMs,
      max: tuning.scanPreviewMax,
    }),
    scanWrite: new SlidingWindowLimiter({
      windowMs: tuning.scanWindowMs,
      max: tuning.scanWriteMax,
    }),
  };
}

export function enforceLimit(limiter: SlidingWindowLimiter, key: string): void {
  const decision = limiter.take(key);
  if (decision.ok) return;
  throw tooManyRequests(Math.max(1, Math.ceil(decision.retryAfterMs / 1000)));
}

export function loginLimitKeys(req: Request, username: string): { ip: string; user: string } {
  return {
    ip: `ip:${clientIp(req)}`,
    user: `user:${username.trim().toLowerCase()}`,
  };
}

export type ServerRuntime = {
  rateLimitEnabled: boolean;
  guards: HttpGuards;
};

function runtimeOf(req: Request): ServerRuntime | undefined {
  return req.app.locals.runtime as ServerRuntime | undefined;
}

export const scanPreviewGuard: RequestHandler = (req, res, next) => {
  const runtime = runtimeOf(req);
  if (!runtime?.rateLimitEnabled) {
    next();
    return;
  }
  rateLimit({
    limiter: runtime.guards.scanPreview,
    key: (r) => `user:${r.auth?.id ?? clientIp(r)}`,
  })(req, res, next);
};

export const scanWriteGuard: RequestHandler = (req, res, next) => {
  const runtime = runtimeOf(req);
  if (!runtime?.rateLimitEnabled) {
    next();
    return;
  }
  rateLimit({
    limiter: runtime.guards.scanWrite,
    key: (r) => `user:${r.auth?.id ?? clientIp(r)}`,
  })(req, res, next);
};
