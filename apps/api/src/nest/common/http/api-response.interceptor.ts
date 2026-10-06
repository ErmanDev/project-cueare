import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import type { ApiResponse } from './api-response.ts';
import { isPageResult, paginationMeta } from './api-response.ts';
import { ensureRequestId } from './request-id.ts';

/** Success envelope for v2 HTTP controllers only. */
@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = ensureRequestId(request, response);
    return next.handle().pipe(map((data) => {
      if (isPageResult(data)) {
        return {
          data: data.items,
          meta: {
            requestId,
            pagination: paginationMeta({
              page: data.page,
              pageSize: data.pageSize,
              totalItems: data.totalItems,
            }),
          },
        } as ApiResponse<T>;
      }
      return { data, meta: { requestId } };
    }));
  }
}
