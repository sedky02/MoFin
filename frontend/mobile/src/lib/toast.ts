// Toast store with the call shape the web's `sonner` has, so the copied hooks need no changes.
// The view is src/components/toast-host.tsx, which subscribes to this store.
import { haptics } from "@/lib/haptics";

export type ToastKind = "success" | "error";

export type ToastAction = { label: string; onClick: () => void };

export type ToastOptions = {
  /** Same id = the toast replaces itself instead of stacking. */
  id?: string;
  description?: string;
  /** Milliseconds; `Infinity` keeps it until dismissed. */
  duration?: number;
  action?: ToastAction;
  cancel?: ToastAction;
};

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  description?: string;
  duration: number;
  action?: ToastAction;
  cancel?: ToastAction;
};

export const DEFAULT_TOAST_DURATION_MS = 4_000;
/** Older toasts beyond this many are dropped, so a burst of failures can't cover the screen. */
export const MAX_VISIBLE_TOASTS = 3;

let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return items;
}

function show(kind: ToastKind, message: string, options?: ToastOptions): string {
  if (kind === "success") haptics.success();
  else haptics.error();
  counter += 1;
  const id = options?.id ?? `toast-${counter}`;
  const item: ToastItem = {
    id,
    kind,
    message,
    description: options?.description,
    duration: options?.duration ?? DEFAULT_TOAST_DURATION_MS,
    action: options?.action,
    cancel: options?.cancel,
  };
  const existing = items.findIndex((t) => t.id === id);
  if (existing >= 0) {
    items = items.map((t, i) => (i === existing ? item : t));
  } else {
    items = [...items, item].slice(-MAX_VISIBLE_TOASTS);
  }
  emit();
  return id;
}

export function dismissToast(id?: string): void {
  items = id === undefined ? [] : items.filter((t) => t.id !== id);
  emit();
}

export function resetToasts(): void {
  items = [];
  counter = 0;
  emit();
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show("success", message, options),
  error: (message: string, options?: ToastOptions) => show("error", message, options),
  dismiss: dismissToast,
};
