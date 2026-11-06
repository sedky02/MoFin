// One HTTP call with no session logic: JSON in and out, 204 handling, the web's error shape
// (ApiClientError) and a timeout; client.ts adds the bearer token and refresh.
import { config } from '@/config';
import type { ApiError, ApiError400 } from '@/core/types';

export class ApiClientError extends Error {
  status: number;
  body: ApiError | ApiError400 | undefined;
  validation?: ApiError400['errors'];

  constructor(status: number, message: string, body?: ApiError | ApiError400) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.body = body;
    if (body && 'errors' in body && Array.isArray(body.errors)) {
      this.validation = body.errors;
    }
  }
}

export type SearchParams = Record<string, string | number | boolean | undefined | null>;

export type SendOpts = {
  body?: unknown;
  searchParams?: SearchParams;
  accessToken?: string;
  requestId?: string;
  timeoutMs?: number;
  responseType?: 'json' | 'text';
};

export type TextResponse = { text: string; contentType: string | null; contentDisposition: string | null };

// The web's BFF gave up on the backend after 8 s. The app talks to it directly over a phone
// network, and a cold-starting serverless backend can take longer, so allow a little more.
export const DEFAULT_TIMEOUT_MS = 15_000;

export const TIMEOUT_MESSAGE = 'The server is taking too long to respond.';

export function buildUrl(path: string, searchParams?: SearchParams): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const parts: string[] = [];
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null && v !== '') {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      }
    }
  }
  return `${config.apiUrl}${clean}${parts.length ? `?${parts.join('&')}` : ''}`;
}

/** A random id for `x-request-id` (Hermes has no crypto.randomUUID; this is a log correlation id, not a secret). */
export function newRequestId(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) out += '-';
    out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

export async function send<T>(method: string, path: string, opts: SendOpts = {}): Promise<T> {
  const {
    body,
    searchParams,
    accessToken,
    requestId = newRequestId(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    responseType = 'json',
  } = opts;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-request-id': requestId,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let res: Response;
  try {
    res = await fetch(buildUrl(path, searchParams), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) throw new ApiClientError(504, TIMEOUT_MESSAGE, { statusCode: 504, message: TIMEOUT_MESSAGE });
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();

  if (res.ok && responseType === 'text') {
    const file: TextResponse = {
      text,
      contentType: res.headers.get('content-type'),
      contentDisposition: res.headers.get('content-disposition'),
    };
    return file as T;
  }

  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'message' in data ? String((data as ApiError).message) : undefined) ??
      (res.statusText || 'Request failed');
    throw new ApiClientError(res.status, message, data as ApiError | ApiError400);
  }

  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
