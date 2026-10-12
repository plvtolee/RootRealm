/**
 * RootRealm — Playwright claim journey (TASKS 20.4).
 *
 * ```text
 * Guest → claim → OAuth → persistent profile
 * ```
 *
 * The journey that proves ownership: a guest preview is claimed through the real
 * OAuth flow — `/api/auth/github` redirects to the mock's authorize endpoint,
 * which redirects back to the callback with a code and the state, the callback
 * exchanges the code, reads the identity, claims the account and issues a signed
 * session. Every step is the product's own code; the only substitution is GitHub
 * itself, and that substitution is deliberate (see `e2e/mock-github.mjs`).
 *
 * ## Why this is the journey that needed the endpoint seam
 *
 * The token exchange is a server-to-server call. A browser cannot intercept it,
 * so without `GITHUB_OAUTH_BASE` this journey could only run against the live
 * GitHub with a real OAuth app and a human clicking Authorize. The seam makes it
 * automatic; the mock's authorize endpoint plays the consent screen.
 */
import { expect, test } from "@playwright/test";

import { MOCK_LOGIN } from "./helpers";

test.describe("claim journey — guest to persistent profile", () => {
  test("the claim redirects into a real OAuth flow", async ({ page }) => {
    await page.goto("/preview");
    await page.getByLabel("GitHub username").fill(MOCK_LOGIN);
    await page.getByRole("button", { name: "Preview" }).click();

    // `Connect GitHub` is a real navigation to the OAuth start, which 302s to
    // the authorize endpoint. Following it lands back on the app, signed in.
    await page.getByRole("link", { name: "Connect GitHub" }).click();

    // The flow completes: the browser ends up home, the callback cleared the
    // one-time state cookie, and no `auth_error` was reported.
    await page.waitForURL((url) => !url.searchParams.has("auth_error"));
    expect(new URL(page.url()).searchParams.get("auth_error")).toBeNull();

    // The session cookie is now set. It is HttpOnly, so the browser cannot read
    // its value — which is the point — but the context can see that it exists.
    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === "rr_session");
    expect(session, "a session cookie is set after a successful claim").toBeDefined();
    expect(session?.httpOnly).toBe(true);
  });

  test("the claimed session makes the shop reach the signed-in state", async ({
    page,
    request,
  }) => {
    // Claim through the API directly, so the session is minted by the real
    // callback without re-driving the browser through the redirect twice.
    const start = await request.get("/api/auth/github", { maxRedirects: 0 });
    // The OAuth start is a redirect to the mock's authorize endpoint, not a 503,
    // which proves the seam resolved a configured client id.
    expect(start.status()).toBe(302);
    expect(start.headers()["location"]).toContain("login/oauth/authorize");

    // The claim itself: follow the whole chain the browser would.
    await page.goto("/preview");
    await page.getByLabel("GitHub username").fill(MOCK_LOGIN);
    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("link", { name: "Connect GitHub" }).click();
    await page.waitForURL((url) => !url.searchParams.has("auth_error"));

    // Signed in, the shop no longer offers the signed-out harness: it renders a
    // real shop backed by the session's wallet.
    await page.goto("/shop");
    await expect(page.getByText("Sign in with GitHub")).toHaveCount(0);
  });

  test("claiming twice reuses the account rather than duplicating it", async ({
    page,
  }) => {
    // First claim.
    await page.goto("/preview");
    await page.getByLabel("GitHub username").fill(MOCK_LOGIN);
    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("link", { name: "Connect GitHub" }).click();
    await page.waitForURL((url) => !url.searchParams.has("auth_error"));

    const first = (await page.context().cookies()).find((c) => c.name === "rr_session");

    // Second claim, same GitHub identity. The store is keyed by GitHub id, so
    // this must return the existing account, not create a second one under a
    // different RootRealm id — which is what "login" has to mean.
    await page.goto("/preview");
    await page.getByLabel("GitHub username").fill(MOCK_LOGIN);
    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("link", { name: "Connect GitHub" }).click();
    await page.waitForURL((url) => !url.searchParams.has("auth_error"));

    const second = (await page.context().cookies()).find((c) => c.name === "rr_session");

    // Same user id, so the payload prefix (everything before the signature) is
    // identical even though a fresh token was issued.
    const userIdOf = (value: string) =>
      JSON.parse(Buffer.from(value.slice(0, value.lastIndexOf(".")), "base64url").toString("utf8")).userId;

    expect(userIdOf(second!.value)).toBe(userIdOf(first!.value));
  });
});