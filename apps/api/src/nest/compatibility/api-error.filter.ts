import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ApiError, fromPgBusinessRule } from '../../utils/errors.ts';
import type { ApiErrorDetail, ApiErrorResponse } from '../common/http/api-response.ts';
import { ensureRequestId } from '../common/http/request-id.ts';

function isMalformedJson(exception: unknown): boolean {
  const cause = exception instanceof Error ? exception.cause : undefined;
  if (
    (exception instanceof SyntaxError && 'body' in exception) ||
    (cause instanceof SyntaxError && 'body' in cause)
  ) {
    return true;
  }
  if (!(exception instanceof HttpException) || exception.getStatus() !== 400) return false;
  const body = exception.getResponse();
  const message =
    typeof body === 'object' && body && 'message' in body
      ? (body as { message?: unknown }).message
      : undefined;
  return typeof message === 'string' && /json|unexpected token/i.test(message);
}

function errorCode(statusCode: number): string {
  return ({
    400: 'VALIDATION_FAILED',
    401: 'AUTHENTICATION_FAILED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'RATE_LIMITED',
    503: 'SERVICE_UNAVAILABLE',
  } as Record<number, string>)[statusCode] ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
}

/** Preserves legacy errors while serving the structured v2 error contract. */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (request.path === '/api/v2' || request.path.startsWith('/api/v2/')) {
      this.catchV2(exception, request, response);
      return;
    }

    if (isMalformedJson(exception)) {
      response.status(400).json({ error: 'Request body is not valid JSON' });
      return;
    }
    if (exception instanceof ApiError) {
      const retry = exception.details?.retry_after_seconds;
      if (exception.statusCode === 429 && typeof retry === 'number') {
        response.setHeader('Retry-After', String(retry));
      }
      response.status(exception.statusCode).json(exception.toBody());
      return;
    }
    const pgRule = fromPgBusinessRule(exception);
    if (pgRule) {
      response.status(pgRule.statusCode).json(pgRule.toBody());
      return;
    }
    if (exception instanceof HttpException) {
      const httpResponse = exception.getResponse();
      response.status(exception.getStatus()).json(httpResponse);
      return;
    }

    console.error('Unhandled Nest error:', exception);
    response.status(500).json({ error: 'Internal server error' });
  }

  private catchV2(exception: unknown, request: Request, response: Response): void {
    const requestId = ensureRequestId(request, response);
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: ApiErrorResponse['error']['details'];

    if (isMalformedJson(exception)) {
      statusCode = 400;
      code = 'INVALID_JSON';
      message = 'Request body is not valid JSON.';
    } else if (exception instanceof ApiError) {
      statusCode = exception.statusCode;
      code =
        typeof exception.details?.code === 'string'
          ? exception.details.code
          : errorCode(statusCode);
      message = exception.message;
      details = exception.details;
      const retry = exception.details?.retry_after_seconds;
      if (statusCode === 429 && typeof retry === 'number') {
        response.setHeader('Retry-After', String(retry));
      }
    } else {
      const pgRule = fromPgBusinessRule(exception);
      if (pgRule) {
        statusCode = pgRule.statusCode;
        code = errorCode(statusCode);
        message = pgRule.message;
        details = pgRule.details;
      } else if (exception instanceof HttpException) {
        statusCode = exception.getStatus();
        code = errorCode(statusCode);
        const body = exception.getResponse();
        if (typeof body === 'string') {
          message = body;
        } else if (body && typeof body === 'object' && 'message' in body) {
          const rawMessage = (body as { message?: unknown }).message;
          if (typeof rawMessage === 'string') message = rawMessage;
          if (Array.isArray(rawMessage)) {
            message = 'One or more fields are invalid.';
            details = rawMessage.map<ApiErrorDetail>((item) => ({
              code: 'INVALID_FIELD',
              message: String(item),
            }));
          }
        }
      } else {
        console.error('Unhandled Nest v2 error:', exception);
      }
    }

    const body: ApiErrorResponse = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      meta: { requestId },
    };
    response.status(statusCode).json(body);
  }
}
