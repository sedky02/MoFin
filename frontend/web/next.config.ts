import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone (a minimal server.js plus only the traced
  // node_modules) for the Docker image; `next dev` and `next start` ignore it.
  output: "standalone",
  cacheComponents: true, // enables the "use cache" directive + PPR; data is dynamic by default
  reactCompiler: true, // stable in Next.js 16 — no manual useMemo/useCallback
  async redirects() {
    // The transaction list used to live at /search. Query strings carry over,
    // so old links and bookmarks keep their filters.
    return [{ source: "/search", destination: "/transactions", permanent: false }];
  },
  experimental: {
    turbopackFileSystemCacheForDev: true, // faster cold starts (beta)
    viewTransition: true, // React <ViewTransition> for sidebar nav crossfades
  },
};

export default nextConfig;
