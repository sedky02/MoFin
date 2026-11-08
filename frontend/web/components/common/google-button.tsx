"use client";

/**
 * Navigates to the BFF initiate route (a full navigation: we leave the SPA for an OAuth redirect),
 * carrying the in-flight MCP authorize URL so the connector flow resumes.
 */
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  function start() {
    const search = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    const mcpAuthorize = search.get("mcp_authorize");
    const next = search.get("next");
    if (mcpAuthorize) params.set("mcp_authorize", mcpAuthorize);
    if (next) params.set("next", next);
    const qs = params.toString();
    window.location.href = qs ? `/api/auth/google?${qs}` : "/api/auth/google";
  }

  return (
    <button
      type="button"
      onClick={start}
      className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] border border-border bg-transparent text-[15px] font-semibold text-foreground transition-colors hover:bg-muted/40"
    >
      <svg className="size-[18px]" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"
        />
        <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
        <path
          fill="#34A853"
          d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
        />
      </svg>
      {label}
    </button>
  );
}
