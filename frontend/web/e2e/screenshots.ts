/**
 * Captures a route at desktop (1440x900) and mobile (390x844, touch) in both
 * themes into e2e/.shots/.
 *
 *   npm run e2e:shots -- /dashboard
 *
 * Needs the web app on :3001 (override with E2E_BASE_URL), the backend on :3000,
 * and `npm run e2e:seed` run once. Run with Node's built-in TypeScript support,
 * so keep this file free of enums and local imports.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const here = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(here, ".shots");
const credsFile = resolve(here, ".auth/credentials.json");

const route = process.argv[2];
if (!route || !route.startsWith("/")) {
  console.error("Usage: npm run e2e:shots -- /route   (e.g. /dashboard)");
  process.exit(1);
}

const slug = route.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "") || "root";

const viewports = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, mobile: true },
] as const;
const themes = ["light", "dark"] as const;

async function main() {
  let creds: { email: string; password: string };
  try {
    creds = JSON.parse(readFileSync(credsFile, "utf8"));
  } catch {
    throw new Error("e2e/.auth/credentials.json not found. Run `npm run e2e:seed` first.");
  }

  mkdirSync(shotsDir, { recursive: true });
  const browser = await chromium.launch();

  // Log in once and reuse the cookies (credential endpoints are rate limited).
  const loginCtx = await browser.newContext({ baseURL: BASE_URL });
  const loginRes = await loginCtx.request.post("/api/auth/login", { data: creds });
  if (!loginRes.ok()) throw new Error(`login failed with ${loginRes.status()}`);
  const storageState = await loginCtx.storageState();
  await loginCtx.close();

  for (const vp of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        ...(vp.mobile ? devices["Pixel 7"] : devices["Desktop Chrome"]),
        viewport: vp.viewport,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
        baseURL: BASE_URL,
        storageState,
      });
      await context.addInitScript((t) => {
        try {
          localStorage.setItem("mofin-theme", t);
        } catch {
          /* storage unavailable */
        }
      }, theme);
      const page = await context.newPage();
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      // Keep the Next dev-mode indicator out of PR screenshots.
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      const file = resolve(shotsDir, `${slug}-${vp.name}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
      await context.close();
    }
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
