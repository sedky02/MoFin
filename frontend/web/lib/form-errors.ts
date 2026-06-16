import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api";

/**
 * Central mutation/form error handling per the tanstack-query-conventions skill:
 * - 400 → map field errors into the form via setError (returns true if mapped)
 * - 429 → "Too many requests" toast
 * - 409 → conflict toast with the server message
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
          opts.setError(path as Path<T>, { type: "server", message });
        } else {
          mappedRoot = true;
        }
      }
      if (mappedRoot || error.validation.every((e) => !e.path)) {
        toast.error(error.message);
      }
      return;
    }
    if (error.status === 429) {
      toast.error("Too many requests, try again shortly.");
      return;
    }
    if (error.status === 409) {
      toast.error(error.message);
      return;
    }
    toast.error(error.message || opts?.fallback || "Something went wrong.");
    return;
  }
  toast.error(opts?.fallback ?? "Something went wrong. Please try again.");
}
