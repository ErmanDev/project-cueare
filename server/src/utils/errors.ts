export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toBody(): Record<string, unknown> {
    return {
      error: this.message,
      ...(this.details ?? {}),
    };
  }
}

export function badRequest(
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError(400, message, details);
}

export function unauthorized(message: string): ApiError {
  return new ApiError(401, message);
}

export function forbidden(message: string): ApiError {
  return new ApiError(403, message);
}

export function notFound(message: string): ApiError {
  return new ApiError(404, message);
}

export function methodNotAllowed(): ApiError {
  return new ApiError(405, 'Method not allowed');
}

export function conflict(
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError(409, message, details);
}

export function tooManyRequests(retryAfterSeconds: number): ApiError {
  return new ApiError(429, 'Too many requests', {
    code: 'RATE_LIMITED',
    retry_after_seconds: retryAfterSeconds,
  });
}

export function isPgUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: unknown }).code === '23505',
  );
}
