import crypto from 'node:crypto';

import type { Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function ensureRequestId(request: Request, response: Response): string {
  const existing = response.locals.requestId;
  if (typeof existing === 'string') {
    (request as Request & { requestId?: string }).requestId = existing;
    return existing;
  }

  const supplied = request.headers['x-request-id'];
  const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
  const requestId =
    typeof candidate === 'string' && REQUEST_ID_PATTERN.test(candidate)
      ? candidate
      : crypto.randomUUID();
  response.locals.requestId = requestId;
  (request as Request & { requestId?: string }).requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  return requestId;
}
