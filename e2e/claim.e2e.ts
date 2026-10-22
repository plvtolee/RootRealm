/**
 * RootRealm — Playwright claim journey (TASKS 20.4).
 *
 * ```text
 * /login → GitHub OAuth → persistent account
 * ```
 *
 * The journey that proves the account is real: the login wall links to
 * `/api/auth/github`, which redirects to the mock's authorize endpoint, which
 * redirects back to the callback with a code and the state. The callback
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

import { signInWithMockGitHub } from "./helpers";

test.describe("claim journey — login wall to persistent account", () => {
  test("the login wall starts a real OAuth flow and returns signed in", async ({ page }) => {
    await page.goto("/login");

    // `Continue with GitHub` is a real navigation to the OAuth start, which 302s
    // to the authorize endpoint. Following it lands back on the app, signed in.
    await page.getByRole("link", { name: "Continue with GitHub" }).click();

    await page.waitForURL((url) => url.pathname === "/home");
    expect(new URL(page.url()).searchParams.get("auth_error")).toBeNull();

    // The session cookie is now set. It is HttpOnly, so the browser cannot read
    // its value — which is the point — but the context can see that it exists.
    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === "rr_session");
    expect(session, "a session cookie is set after a successful login").toBeDefined();
    expect(session?.httpOnly).toBe(true);

    // The one-time OAuth cookies are gone: a state value that outlived its flow
    // would be a replayable CSRF token.
    expect(cookies.find((cookie) => cookie.name === "rr_oauth_state")).toBeUndefined();
    expect(cookies.find((cookie) => cookie.name === "rr_oauth_next")).toBeUndefined();
  });

  test("the claimed session makes the shop reach the signed-in state", async ({ page }) => {
    await signInWithMockGitHub(page);

    // Signed in, the shop no longer offers the signed-out harness: it renders a
    // real shop backed by the session's wallet.
    await page.goto("/shop");
    await expect(page.getByText("Sign in with GitHub")).toHaveCount(0);
  });

  test("signing in twice reuses the account rather than duplicating it", async ({
    page,
  }) => {
    // First sign-in.
    await signInWithMockGitHub(page);
    const first = (await page.context().cookies()).find((c) => c.name === "rr_session");

    // A second sign-in, same GitHub identity. Drop the session first so the login
    // wall is reachable again — `/login` forwards an already-signed-in visitor.
    await page.context().clearCookies();
    await signInWithMockGitHub(page);
    const second = (await page.context().cookies()).find((c) => c.name === "rr_session");

    // Same user id, so the payload prefix (everything before the signature) is
    // identical even though a fresh token was issued. The store is keyed by the
    // GitHub numeric id, so a repeat sign-in must return the existing account
    // rather than create a second one under a different RootRealm id — which is
    // what "login" has to mean.
    const userIdOf = (value: string) =>
      JSON.parse(
        Buffer.from(value.slice(0, value.lastIndexOf(".")), "base64url").toString(
          "utf8",
        ),
      ).userId;

    expect(userIdOf(second!.value)).toBe(userIdOf(first!.value));
  });
});
