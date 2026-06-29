"use client";

/**
 * Starts Google sign-in by navigating to the web BFF initiate route. Carries the
 * in-flight MCP authorize URL (if present) so the connector flow resumes after
 * Google returns. Full navigation — we are leaving the SPA for an OAuth redirect.
 */
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  function start() {
    const mcpAuthorize = new URLSearchParams(window.location.search).get("mcp_authorize");
    const href = mcpAuthorize
      ? `/api/auth/google?mcp_authorize=${encodeURIComponent(mcpAuthorize)}`
      : "/api/auth/google";
    window.location.href = href;
  }

  return (
    <button
      type="button"
      onClick={start}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-border bg-transparent text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
    >
      <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21.35 11.1H12v2.9h5.35c-.23 1.4-1.6 4.1-5.35 4.1a5.95 5.95 0 0 1 0-11.9c1.7 0 2.84.72 3.5 1.35l2.38-2.3C16.43 3.7 14.45 2.8 12 2.8a9.2 9.2 0 1 0 0 18.4c5.3 0 8.8-3.72 8.8-8.96 0-.6-.06-1.06-.15-1.14Z"
        />
      </svg>
      {label}
    </button>
  );
}
