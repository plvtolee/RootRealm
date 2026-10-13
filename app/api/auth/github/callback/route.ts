/**
 * RootRealm — `GET /api/auth/github/callback` (TASKS 9.1–9.3).
 *
 * The step that turns a redirect from GitHub into a RootRealm account:
 *
 * 1. compare the `state` to the cookie (CSRF protection);
 * 2. redeem the code for an access token;
 * 3. read the authenticated identity with the token (ownership proof);
 * 4. claim or reuse the RootRealm account (TASKS 9.2–9.3);
 * 5. issue a signed session and redirect home.
 *
 * Every one of those is a function in `lib/auth/*`; the route only sequences
 * them and speaks HTTP. The account store is the in-memory one until TASKS 10.1
 * provides a database, so a restart loses accounts — see `lib/auth/account.ts`.
 */
import { exchangeCode, fetchIdentity, statesMatch, tokenFingerprint, OAUTH_STATE_COOKIE } from "@/lib/auth/oauth";
import { claimAccount } from "@/lib/auth/account";
import { issueSession, sessionCookieAttributes, SESSION_COOKIE } from "@/lib/auth/session";
import { readAuthConfig } from "@/lib/auth/config";
import { accountStore } from "@/lib/db/stores";
import { logAccountClaim, serviceLogger } from "@/lib/ops/monitoring";

export const dynamic = "force-dynamic";

/**
 * The account store.
 *
 * PostgreSQL when `DATABASE_URL` is set, in-memory otherwise (`lib/db/stores.ts`),
 * so the claim survives a restart once a database is configured — and the suite
 * still runs with none.
 */
const accounts = accountStore();

export async function GET(request: Request): Promise<Response> {
  const config = readAuthConfig();
  if (config === null) {
    return redirectWithError("not_configured");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieState = readCookie(request.headers.get("cookie"), OAUTH_STATE_COOKIE);
  if (!statesMatch(cookieState ?? "", state)) {
    return redirectWithError("state_mismatch");
  }

  if (code === null) {
    // GitHub reports a denied authorization as `?error=access_denied` with no
    // code. That is a normal outcome, not a failure of ours.
    return redirectWithError("authorization_denied");
  }

  const token = await exchangeCode({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    code,
    redirectUri: config.redirectUri,
  });

  if (!token.ok) {
    return redirectWithError(token.reason);
  }

  const identity = await fetchIdentity(token.accessToken);
  if (identity === null) {
    return redirectWithError("identity_unavailable");
  }

  const claimed = await claimAccount({
    identity,
    store: accounts,
    now: new Date().toISOString(),
  });

  const session = issueSession(claimed.account.id, { secret: config.sessionSecret });

  // The token itself is never persisted or returned: with no database (Phase 10)
  // there is nowhere safe to keep it, and nothing needs it yet. TASKS 21.3
  // replaces the ad-hoc `console.info` with the structured emitter, which logs a
  // correlation fingerprint and would redact the token by value if it ever
  // reached a field.
  logAccountClaim(
    {
      login: identity.login,
      githubId: identity.githubId,
      existing: claimed.existing,
      tokenFingerprint: tokenFingerprint(token.accessToken),
    },
    serviceLogger("auth"),
  );

  const headers = new Headers({ location: "/" });
  headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${session.value}; ${sessionCookieAttributes(config.isProduction)}`,
  );
  // Clear the one-time state cookie now that it has been used.
  headers.append(
    "set-cookie",
    `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );

  return new Response(null, { status: 302, headers });
}

/** Reads one cookie value from a `Cookie` header. */
function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** A failure that is reported to the user, never as a raw error page. */
function redirectWithError(reason: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location: `/?auth_error=${encodeURIComponent(reason)}` },
  });
}