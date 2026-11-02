// Placeholder for the API client. Phase 4 replaces `request` with the real fetch
// wrapper (bearer token, single-flight refresh). The shape below is what the hooks
// already depend on, so they will not change.
import type { ApiError, ApiError400 } from "@/core/types";

export class ApiClientError extends Error {
  status: number;
  body: ApiError | ApiError400 | undefined;
  /** Present when status === 400: field-level validation errors. */
  validation?: ApiError400["errors"];

  constructor(status: number, message: string, body?: ApiError | ApiError400) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
    if (body && "errors" in body && Array.isArray(body.errors)) {
      this.validation = body.errors;
    }
  }
}

type SearchParams = Record<string, string | number | boolean | undefined | null>;
type RequestOpts = { searchParams?: SearchParams };

async function request<T>(_method: string, _path: string, _body?: unknown, _opts?: RequestOpts): Promise<T> {
  throw new Error("The API client is not wired yet (Phase 4).");
}

export const api = {
  get: <T>(path: string, searchParams?: SearchParams) => request<T>("GET", path, undefined, { searchParams }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};
