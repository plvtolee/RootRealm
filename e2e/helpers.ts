/**
 * RootRealm — E2E helpers shared by the journeys (TASKS 20.3–20.6).
 *
 * ```text
 * the one account the mock GitHub knows, and the two ways to become signed in
 * ```
 */

/** The single login `e2e/mock-github.mjs` serves. */
export const MOCK_LOGIN = "e2e-dev";

/** The dev-harness user id, matching `/api/dev/session`'s default. */
export const DEV_USER_ID = "dev-user";

/** The cookie `/api/dev/session` sets and the server reads as the session. */
export const SESSION_COOKIE = "rr_session";

/**
 * Seeds a funded, signed-in wallet through the development harness and copies
 * the resulting session cookie into the browser context.
 *
 * This is the intended way to reach a signed-in state without a GitHub OAuth app
 * (the harness exists for exactly this, TASKS 15.3), and it is the only path that
 * both mints a session and gives the wallet coins to spend. It answers 404 in a
 * production build, so the economy journeys are development-mode journeys.
 *
 * ## Why the cookie is copied
 *
 * `APIRequestContext` keeps its own cookie jar, separate from the browser
 * context's. Posting the dev session authenticates the *request* context, but the
 * page would still be a guest — so the cookie is lifted into the browser context
 * explicitly. `HttpOnly` does not prevent this: it stops *scripts* reading the
 * cookie, not the test harness setting it.
 */
export async function fundDevWallet(
  request: import("@playwright/test").APIRequestContext,
  context: import("@playwright/test").BrowserContext,
  options: { userId?: string; coins?: number } = {},
): Promise<void> {
  const response = await request.post("/api/dev/session", {
    data: { userId: options.userId ?? DEV_USER_ID, coins: options.coins ?? 5_000 },
  });

  if (!response.ok()) {
    throw new Error(
      `dev session failed: ${response.status()} ${await response.text()}`,
    );
  }

  const state = await request.storageState();
  const session = state.cookies.find((cookie) => cookie.name === SESSION_COOKIE);
  if (!session) {
    throw new Error("dev session set no session cookie");
  }

  await context.addCookies([
    {
      name: session.name,
      value: session.value,
      domain: "localhost",
      path: "/",
      httpOnly: session.httpOnly,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}