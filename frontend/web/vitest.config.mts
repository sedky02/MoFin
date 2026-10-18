import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only. Playwright owns e2e/ (its specs are *.spec.ts too), so
// unit tests are *.test.ts(x) next to the code they cover.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    environment: "node",
  },
});
