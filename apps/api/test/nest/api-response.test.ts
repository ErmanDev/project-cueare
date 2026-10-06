import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, spyOn } from 'bun:test';
import type { Response } from 'express';

import { paginationMeta } from '../../src/nest/common/http/api-response.ts';
import { ApiErrorFilter } from '../../src/nest/compatibility/api-error.filter.ts';

describe('API v2 response contract', () => {
  it('calculates pagination metadata without nesting records', () => {
    expect(paginationMeta({ page: 2, pageSize: 20, totalItems: 50 })).toEqual({
      page: 2,
      pageSize: 20,
      totalItems: 50,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('handles an empty result set', () => {
    expect(paginationMeta({ page: 1, pageSize: 20, totalItems: 0 })).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('does not expose unexpected exception details through legacy Nest routes', () => {
    let statusCode = 0;
    let body: unknown;
    const response = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      },
    } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ path: '/api/legacy-route' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const errorLog = spyOn(console, 'error').mockImplementation(() => {});

    try {
      new ApiErrorFilter().catch(new Error('secret database connection detail'), host);
    } finally {
      errorLog.mockRestore();
    }

    expect(statusCode).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('secret database connection detail');
  });
});
