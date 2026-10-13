/**
 * RootRealm — Playwright configuration (TASKS 20.3–20.6).
 *
 * ```text
 * a mock GitHub + the app, wired so a journey exercises the real server code
 * ```
 *
 * Two servers start before the tests:
 *
 * 1. `e2e/mock-github.mjs` on 4599 — the deterministic GitHub the app talks to.
 * 2. the app on 3100, in development mode.
 *
 * ## Why development mode, and why port 3100
 *
 * The journeys reach code that is gated on `NODE_ENV !== "production"`:
 * `GITHUB_API_BASE` / `GITHUB_OAUTH_BASE` (the mock seam, `lib/github/endpoints.ts`)
 * and `/api/dev/session` (the wallet seeder). Two independent gates refusing
 * anything else, so a production build *cannot* be pointed at a mock — which is
 * exactly the property TASK 19.1 wants, and it means the E2E server must be a
 * development server. Port 3100 keeps it clear of the production server a
 * developer may already be running on 3000.
 *
 * ## What this deliberately does not test
 *
 * Performance. TASKS 18 was measured against `next build && next start`; a dev
 * server's numbers mean nothing. These journeys test *behaviour* — that a guest
 * can look up a profile, claim it, earn coins and equip what they bought — which
 * is the same code in either mode.
 */
import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3100;
const MOCK_PORT = 4599;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  // The journeys share one app process and one in-memory wallet singleton, so
  // they run in order rather than racing each other for the same account.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "node e2e/mock-github.mjs",
      url: `http://localhost:${MOCK_PORT}/users/e2e-dev`,
      reuseExistingServer: true,
      timeout: 30_000,
      env: { MOCK_GITHUB_PORT: String(MOCK_PORT) },
    },
    {
      command: `npx next dev --port ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/`,
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        // Development mode is what lets the two dev gates below take effect.
        NODE_ENV: "development",
        // Point every GitHub call at the mock. Honored only outside production.
        GITHUB_API_BASE: `http://localhost:${MOCK_PORT}`,
        GITHUB_OAUTH_BASE: `http://localhost:${MOCK_PORT}`,
        // A complete OAuth config, so `/api/auth/github` builds a redirect to the
        // mock's authorize endpoint instead of answering 503.
        GITHUB_OAUTH_CLIENT_ID: "mock-client-id",
        GITHUB_OAUTH_CLIENT_SECRET: "mock-client-secret",
        GITHUB_OAUTH_REDIRECT_URI: `http://localhost:${APP_PORT}/api/auth/github/callback`,
        // Signs the session cookie; the dev harness needs one to seed a wallet.
        SESSION_SECRET: "e2e-session-secret-not-a-real-secret",
        // Force the in-memory store, even when the developer's `.env.local` names a
        // real database.
        //
        // These journeys assert exact balances ("5,000 CC"), which is only
        // meaningful against a store that starts empty. With a persistent database
        // the previous run's purchase is still there and the assertion fails for a
        // reason that has nothing to do with the code under test — and worse, the
        // suite would write its fixtures into the developer's real Supabase
        // project. Tests must not mutate the data a development server depends on.
        DATABASE_URL: "",
      },
    },
  ],
});