// Minimal toast facade with the call shape the web's `sonner` has, so the copied hooks
// need no changes. Phase 5 replaces the sink with a real toast view.
type ToastOptions = {
  id?: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
  /** A second, secondary button (sonner's `cancel`). */
  cancel?: { label: string; onClick: () => void };
};
type Listener = (kind: "success" | "error", message: string, options?: ToastOptions) => void;

let sink: Listener = () => {};

/** Phase 5 registers the toast view here. */
export function setToastSink(listener: Listener): void {
  sink = listener;
}

export const toast = {
  success: (message: string, options?: ToastOptions) => sink("success", message, options),
  error: (message: string, options?: ToastOptions) => sink("error", message, options),
};
