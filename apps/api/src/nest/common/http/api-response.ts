export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type ApiMeta = {
  requestId: string;
  pagination?: PaginationMeta;
};

export type ApiResponse<T> = {
  data: T;
  meta: ApiMeta;
};

export type ApiErrorDetail = {
  code: string;
  message: string;
  field?: string;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | Record<string, unknown>;
  };
  meta: Pick<ApiMeta, 'requestId'>;
};

const PAGE_RESULT = Symbol('PAGE_RESULT');

export type PageResult<T> = {
  readonly [PAGE_RESULT]: true;
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
};

export function pageResult<T>(input: Omit<PageResult<T>, typeof PAGE_RESULT>): PageResult<T> {
  return { [PAGE_RESULT]: true, ...input };
}

export function isPageResult(value: unknown): value is PageResult<unknown> {
  return Boolean(value && typeof value === 'object' && PAGE_RESULT in value);
}

export function paginationMeta(input: {
  page: number;
  pageSize: number;
  totalItems: number;
}): PaginationMeta {
  const totalPages = input.totalItems === 0 ? 0 : Math.ceil(input.totalItems / input.pageSize);
  return {
    ...input,
    totalPages,
    hasNextPage: input.page < totalPages,
    hasPreviousPage: input.page > 1 && totalPages > 0,
  };
}
