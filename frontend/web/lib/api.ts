// Client-side fetch wrapper. The browser ONLY ever talks to /api/backend/* (the BFF proxy).
// Tokens live in httpOnly cookies and are attached server-side by the proxy.
import type { ApiError, ApiError400 } from "@/lib/types";

export class ApiClientError extends Error {
  status: number;
  body: ApiError | ApiError400 | undefined;
  /** Present when status === 400 — field-level validation errors. */
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

const BASE = "/api/backend";

type RequestOpts = Omit<RequestInit, "body"> & {
  body?: unknown;
  // path beneath /api/v1, e.g. "/accounts" or "/ledger/balance"
  searchParams?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, searchParams?: RequestOpts["searchParams"]): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const qs = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
  }
  const query = qs.toString();
  return `${BASE}${clean}${query ? `?${query}` : ""}`;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { body, searchParams, headers, ...rest } = opts;
  const init: RequestInit = {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    // Always dynamic — no caching of user financial data on the client.
    cache: "no-store",
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(buildUrl(path, searchParams), init);

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data
        ? String((data as ApiError).message)
        : undefined) ?? res.statusText ?? "Request failed";
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

export const api = {
  get: <T>(path: string, searchParams?: RequestOpts["searchParams"]) =>
    request<T>(path, { method: "GET", searchParams }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
