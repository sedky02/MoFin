import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true, // enables the "use cache" directive + PPR; data is dynamic by default
  reactCompiler: true, // stable in Next.js 16 — no manual useMemo/useCallback
  experimental: {
    turbopackFileSystemCacheForDev: true, // faster cold starts (beta)
    viewTransition: true, // React <ViewTransition> for sidebar nav crossfades
  },
};

export default nextConfig;
