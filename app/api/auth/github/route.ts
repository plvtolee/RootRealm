/**
 * RootRealm — `GET /api/auth/github` (TASKS 9.1).
 *
 * Starts the OAuth flow: build the authorize URL, stash the `state` in a
 * short-lived HttpOnly cookie, and redirect the browser to GitHub. When the
 * developer comes back, the callback compares the state it receives to the
 * cookie, which is what proves the callback belongs to a flow *this* browser
 * started.
 *
 * The route owns HTTP only. URL construction, the scope list and the state
 * comparison live in `lib/auth/oauth.ts`, where they are testable without a
 * browser.
 */
import { buildAuthorizationUrl, createState, OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_SECONDS } from "@/lib/auth/oauth";
import { readAuthConfig } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = readAuthConfig();

  if (config === null) {
    // A deployment without OAuth credentials is a configuration state, not a
    // crash. The browser gets a clear message; the server stays up.
    return new Response("GitHub OAuth is not configured on this deployment.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const state = createState();
  const authorizationUrl = buildAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
  });

  const secure = config.isProduction ? "; Secure" : "";

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizationUrl,
      "set-cookie":
        `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_STATE_TTL_SECONDS}${secure}`,
    },
  });
}