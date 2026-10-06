import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api";

// Same message -> same toast id, so a hook-level onError and a caller-level
// handleApiError for one failure show a single toast instead of two.
function toastOnce(message: string) {
  toast.error(message, { id: message });
}

// Backend DTO paths -> form field names (the form keeps the raw text as `amountRaw`).
function toFormPath(path: string): string {
  return path.replace(/^amount$/, "amountRaw").replace(/^(items\.\d+)\.amount$/, "$1.amountRaw");
}

/**
 * Central mutation/form error handling per the tanstack-query-conventions skill:
 * - 400 → map field errors into the form via setError (returns true if mapped)
 * - 429 → "Too many requests" toast
 * - 409 → conflict toast with the server message
 * - 504 → "slow" toast, distinct from a generic/broken failure (audit PERF-XX)
 * - otherwise → generic toast (or the server message if present)
 */
export function handleApiError<T extends FieldValues>(
  error: unknown,
  opts?: { setError?: UseFormSetError<T>; fallback?: string },
): void {
  if (error instanceof ApiClientError) {
    if (error.status === 400 && error.validation?.length && opts?.setError) {
      let mappedRoot = false;
      for (const { path, message } of error.validation) {
        if (path) {
          opts.setError(toFormPath(path) as Path<T>, { type: "server", message });
        } else {
          mappedRoot = true;
        }
      }
      if (mappedRoot || error.validation.every((e) => !e.path)) {
        toastOnce(error.message);
      }
      return;
    }
    if (error.status === 429) {
      toastOnce("Too many requests, try again shortly.");
      return;
    }
    if (error.status === 409) {
      toastOnce(error.message);
      return;
    }
    if (error.status === 504) {
      toastOnce("The server is taking too long to respond. Please try again.");
      return;
    }
    toastOnce(error.message || opts?.fallback || "Something went wrong.");
    return;
  }
  toastOnce(opts?.fallback ?? "Something went wrong. Please try again.");
}
