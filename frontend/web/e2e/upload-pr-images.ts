// Attaches PNGs to a PR comment box on GitHub and prints `<file>\t<url>` lines: npm run e2e:upload -- <pr> <path>...
// Needs a signed-in headed profile (E2E_GH_PROFILE); nothing is submitted. Node TS: no enums or local imports.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { chromium } from "@playwright/test";

const REPO = process.env.E2E_GH_REPO ?? "sedky02/MoFin";
const profileDir = process.env.E2E_GH_PROFILE ?? resolve(homedir(), ".cache/mofin-gh-profile");

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args.splice(outIdx, 2)[1] : undefined;
const [pr, ...inputs] = args;

if (!pr || !/^\d+$/.test(pr) || inputs.length === 0) {
  console.error("Usage: npm run e2e:upload -- <pr-number> <file-or-dir>... [--out urls.json]");
  process.exit(1);
}

const files = inputs
  .flatMap((p) => {
    const abs = resolve(p);
    return statSync(abs).isDirectory()
      ? readdirSync(abs)
          .filter((f) => f.endsWith(".png"))
          .sort()
          .map((f) => resolve(abs, f))
      : [abs];
  })
  .filter((f, i, all) => all.indexOf(f) === i);

if (files.length === 0) {
  console.error("No PNG files found.");
  process.exit(1);
}

async function main() {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const url = `https://github.com/${REPO}/pull/${pr}`;
  await page.goto(url);

  const signedIn = () => page.locator('meta[name="user-login"]').evaluate((m) => !!(m as HTMLMetaElement).content);
  if (!(await signedIn().catch(() => false))) {
    // GitHub redirects to /login?return_to=<pr>; after sign-in it lands back on the PR.
    console.error("Not signed in to GitHub. Sign in in the browser window (up to 10 minutes)...");
    await page.waitForURL((u) => u.pathname === `/${REPO}/pull/${pr}`, { timeout: 600_000 });
  }

  const box = page.locator("textarea#new_comment_field");
  await box.waitFor({ timeout: 30_000 });
  const input = page.locator("form:has(textarea#new_comment_field) input[type=file]").first();
  await input.setInputFiles(files);

  // GitHub inserts `![Uploading x.png…]()` and swaps in the real link when done.
  await page.waitForFunction(
    (n) => {
      const v = (document.querySelector("textarea#new_comment_field") as HTMLTextAreaElement).value;
      return !/Uploading/.test(v) && (v.match(/user-attachments/g) ?? []).length >= n;
    },
    files.length,
    { timeout: 180_000 },
  );

  const text = await box.inputValue();
  await box.fill(""); // never submit; this was only a way to get hosted URLs
  await context.close();

  // GitHub writes either `![name](url)` or `<img alt="name" src="url">`, depending on image size.
  const asset = "https:\\/\\/github\\.com\\/user-attachments\\/[^)\\s\"]+";
  const found = [
    ...text.matchAll(new RegExp(`!\\[([^\\]]*)\\]\\((${asset})\\)`, "g")),
    ...text.matchAll(new RegExp(`<img[^>]*?alt="([^"]*)"[^>]*?src="(${asset})"`, "g")),
  ].map((m) => ({ name: m[1], url: m[2] }));
  if (found.length !== files.length) {
    throw new Error(`Uploaded ${files.length} files but found ${found.length} links:\n${text}`);
  }

  // GitHub names each link after the file (extension dropped); match on that.
  const result: Record<string, string> = {};
  for (const f of files) {
    const stem = basename(f).replace(/\.png$/, "");
    const hit = found.find((x) => x.name === stem || x.name === basename(f));
    if (!hit) throw new Error(`No link found for ${basename(f)}:\n${text}`);
    result[basename(f)] = hit.url;
  }
  for (const [name, link] of Object.entries(result)) console.log(`${name}\t${link}`);
  if (outFile) writeFileSync(resolve(outFile), JSON.stringify(result, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
