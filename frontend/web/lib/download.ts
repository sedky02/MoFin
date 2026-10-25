import { ApiClientError } from "@/lib/api";
import { loginUrlWithNext } from "@/lib/safe-next";
import type { ApiError } from "@/lib/types";

/**
 * The filename a Content-Disposition header asks for, or `fallback`.
 * Handles the quoted and bare `filename=` forms (what the backend sends) and
 * RFC 5987 `filename*=UTF-8''…`, which wins when both are present. Path
 * separators are stripped so a header can't point outside the downloads folder.
 */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  let name: string | undefined;
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (extended) {
    try {
      name = decodeURIComponent(extended[1].trim());
    } catch {
      name = undefined;
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/.exec(header);
    name = (plain?.[1] ?? plain?.[2])?.trim();
  }
  const safe = name?.replace(/[/\\]/g, "_");
  return safe || fallback;
}

/**
 * Fetches a file through the BFF and hands it to the browser as a download.
 * Fetching first (rather than a bare `<a href download>`) lets an error, such
 * as the export's rate limit, show as a toast instead of saving the error
 * body as the file. Throws ApiClientError on a non-2xx answer, after sending
 * the user to sign in again on a 401.
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // The BFF only answers 401 once the session is over (see lib/api.ts).
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.assign(loginUrlWithNext(window.location.pathname, "expired"));
    }
    let body: ApiError | undefined;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = undefined;
    }
    throw new ApiClientError(res.status, body?.message ? String(body.message) : res.statusText, body);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filenameFromDisposition(res.headers.get("content-disposition"), fallbackName);
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
