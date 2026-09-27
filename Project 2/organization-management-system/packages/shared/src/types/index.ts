import { SystemRoleType, ErrorCodeType } from '../constants/index.js';

export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCodeType | string;
    message: string;
    details?: unknown;
    requestId?: string;
    stack?: string;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface JwtTokenPayload {
  sub: string;
  org?: string;
  role?: SystemRoleType;
  type: 'access' | 'refresh';
}
