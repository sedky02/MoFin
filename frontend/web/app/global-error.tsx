"use client";

import * as React from "react";
import { reportError } from "@/lib/error-reporting";

/**
 * Last-resort boundary: catches an error thrown by the root layout itself (or
 * anything above every other error.tsx). Next.js requires this to render its
 * own <html>/<body> since it replaces the root layout entirely — kept
 * deliberately dependency-free (no shared components/providers) since those
 * could be part of what crashed.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => reportError(error, { boundary: "global" }), [error]);
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: "#666", maxWidth: "24rem" }}>
          MoFin hit an unexpected error and couldn&apos;t load. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            border: "1px solid #ccc",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
