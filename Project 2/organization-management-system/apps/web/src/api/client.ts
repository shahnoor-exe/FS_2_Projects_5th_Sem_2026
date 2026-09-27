import { ApiSuccessResponse, ApiErrorResponse } from '../types/index.js';

let inMemoryToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];
let onUnauthenticatedHandler: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  inMemoryToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryToken;
}

export function setOnUnauthenticated(callback: () => void) {
  onUnauthenticatedHandler = callback;
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  requestId?: string;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', status: number = 500, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  skipAuthRefresh?: boolean;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiSuccessResponse<T>> {
  const { params, skipAuthRefresh, ...customConfig } = options;

  let url = endpoint.startsWith('http') ? endpoint : `/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const headers: Record<string, string> = {
    'X-OrgSphere-Client': 'web',
    ...(customConfig.headers as Record<string, string>),
  };

  if (inMemoryToken) {
    headers['Authorization'] = `Bearer ${inMemoryToken}`;
  }

  if (customConfig.body && typeof customConfig.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const config: RequestInit = {
    credentials: 'include',
    ...customConfig,
    headers,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (err: unknown) {
    throw new ApiError(
      err instanceof Error ? err.message : 'Network connection failure',
      'NETWORK_ERROR',
      0
    );
  }

  // Handle 401 with Token Refresh (only if not an auth endpoint already)
  if (response.status === 401 && !skipAuthRefresh && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/register')) {
    if (!isRefreshing) {
      isRefreshing = true;

      try {
        const refreshRes = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-OrgSphere-Client': 'web',
            'Content-Type': 'application/json',
          },
        });

        if (refreshRes.ok) {
          const refreshData = (await refreshRes.json()) as ApiSuccessResponse<{ accessToken: string }>;
          const newToken = refreshData.data.accessToken;
          setAccessToken(newToken);
          isRefreshing = false;
          onRefreshed(newToken);

          // Retry initial request with new token
          headers['Authorization'] = `Bearer ${newToken}`;
          return request<T>(endpoint, { ...options, headers, skipAuthRefresh: true });
        } else {
          isRefreshing = false;
          setAccessToken(null);
          refreshSubscribers = [];
          if (onUnauthenticatedHandler) onUnauthenticatedHandler();
          throw new ApiError('Session expired. Please log in again.', 'UNAUTHENTICATED', 401);
        }
      } catch (err) {
        isRefreshing = false;
        setAccessToken(null);
        refreshSubscribers = [];
        if (onUnauthenticatedHandler) onUnauthenticatedHandler();
        throw err;
      }
    } else {
      // Queue until ongoing refresh completes
      return new Promise((resolve, reject) => {
        refreshSubscribers.push((newToken: string) => {
          headers['Authorization'] = `Bearer ${newToken}`;
          request<T>(endpoint, { ...options, headers, skipAuthRefresh: true })
            .then(resolve)
            .catch(reject);
        });
      });
    }
  }

  let jsonResult: unknown;
  try {
    jsonResult = await response.json();
  } catch {
    jsonResult = null;
  }

  if (!response.ok) {
    const errorBody = jsonResult as ApiErrorResponse | null;
    const message = errorBody?.error?.message || `HTTP error ${response.status}: ${response.statusText}`;
    const code = errorBody?.error?.code || 'UNKNOWN_ERROR';
    const details = errorBody?.error?.details;
    const requestId = errorBody?.error?.requestId;
    throw new ApiError(message, code, response.status, details, requestId);
  }

  return jsonResult as ApiSuccessResponse<T>;
}

export const apiClient = {
  get: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(endpoint, { method: 'GET', params }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    }),

  delete: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(endpoint, { method: 'DELETE', params }),
};
