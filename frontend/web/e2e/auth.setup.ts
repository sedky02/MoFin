import { readFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";

const STATE_FILE = "e2e/.auth/user.json";

// Logs in through the web BFF (/api/auth/login) so the httpOnly cookies land in
// the saved storage state. Requires `npm run e2e:seed` to have been run.
setup("log in as the fixture user", async ({ request }) => {
  let creds: { email: string; password: string };
  try {
    creds = JSON.parse(readFileSync("e2e/.auth/credentials.json", "utf8"));
  } catch {
    throw new Error("e2e/.auth/credentials.json not found. Run `npm run e2e:seed` first.");
  }
  const res = await request.post("/api/auth/login", { data: creds });
  expect(res.ok(), `login failed with ${res.status()}`).toBeTruthy();
  await request.storageState({ path: STATE_FILE });
});
