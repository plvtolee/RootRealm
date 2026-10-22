/**
 * RootRealm — GitHub OAuth (TASKS 9.1).
 *
 * ```text
 * authorization code → access token → verified GitHub identity
 * ```
 *
 * TASKS 9.1 asks for ownership verification. The OAuth web flow is how that is
 * proved: GitHub redirects the developer back with a one-time code that only we
 * can redeem, and the token that comes back reads the authenticated user — whose
 * login is GitHub's own statement of who is holding the token. Matching that
 * login to a claimed profile is TASKS 9.3.
 *
 * ## Why the protocol lives here, not in the route
 *
 * The route (`app/api/auth/github/*`) owns HTTP: status codes, cookies,
 * redirects. Everything that can be *wrong about OAuth* is here and pure: the
 * URL that is built, the exact scopes requested, the state comparison, the token
 * exchange, the identity read. That makes the security-relevant parts testable
 * without a browser or a live GitHub app, which is the only way 9.4's boundaries
 * can be asserted rather than asserted-about.
 *
 * ## The three decisions worth defending
 *
 * 1. **Scopes are minimal and fixed.** { GITHUB_SCOPES } is exactly
 *    `read:user`: enough to read the authenticated login and nothing else. The
 *    repo, workflow and org scopes are never requested, because RootRealm reads
 *    public data through the unauthenticated API and needs no write access at
 *    all. TASKS 9.4 requires "only required scopes are requested" — this is the
 *    single place that decides them, so it is the single place to audit.
 *
 * 2. **State is mandatory and compared in constant time.** Without it, an
 *    attacker can feed a victim a callback code from the attacker's account and
 *    silently bind the victim's session to it (login CSRF). The comparison
 *    uses `timingSafeEqual`, so the check does not leak how much of the state
 *    matched.
 *
 * 3. **The token never leaves this module's caller.** The token is returned to
 *    the server route, which stores it server-side (Phase 10) or discards it.
 *    It is never part of a response body; TASKS 9.4's "credentials remain
 *    server-side" is enforced again in `permissions.ts`.
 *
 * ## What is not here
 *
 * No storage. Where the access token and the account are kept is Phase 10's
 * decision; this module is the protocol and the identity read only.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { gitHubApiBase, gitHubOAuthBase } from "../github/endpoints";

/**
 * The one scope RootRealm requests.
 *
 * `read:user` reads the authenticated user's profile — including the login that
 * proves ownership. It grants no repository, no write and no organisation
 * access. Everything else RootRealm consumes is public and needs no scope at
 * all.
 */
export const GITHUB_SCOPES: readonly string[] = ["read:user"];

const API_VERSION = "2022-11-28";

/** The OAuth authorize endpoint on the resolved host. */
function authorizeUrl(): string {
  return `${gitHubOAuthBase()}/login/oauth/authorize`;
}

/** The OAuth token endpoint on the resolved host. */
function tokenUrl(): string {
  return `${gitHubOAuthBase()}/login/oauth/access_token`;
}

/**
 * The authenticated-user endpoint. This is the REST API base, not the OAuth web
 * host, so it follows `GITHUB_API_BASE` rather than `GITHUB_OAUTH_BASE`.
 */
function userUrl(): string {
  return `${gitHubApiBase()}/user`;
}

/** A verified GitHub identity, read with the access token. */
export interface GitHubIdentity {
  readonly login: string;
  readonly githubId: number;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

/** What `buildAuthorizationUrl` needs. */
export interface AuthorizationUrlInput {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  /** Overrides `GITHUB_SCOPES`; used by tests to prove the default is minimal. */
  readonly scopes?: readonly string[];
}

/**
 * Builds the URL the browser is sent to.
 *
 * `allow_signup` is left at GitHub's default so a developer without an account
 * can still be routed to create one; the flow does not depend on it.
 */
export function buildAuthorizationUrl(input: AuthorizationUrlInput): string {
  const url = new URL(authorizeUrl());
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", (input.scopes ?? GITHUB_SCOPES).join(" "));
  url.searchParams.set("state", input.state);
  return url.toString();
}

/**
 * The cookie that carries the OAuth `state` between the authorize redirect and
 * the callback. Named here rather than in the route, because both routes and
 * their tests need it and a route module may not export arbitrary values.
 */
export const OAUTH_STATE_COOKIE = "rr_oauth_state";

/** The short-lived cookie carrying the validated post-login destination. */
export const OAUTH_NEXT_COOKIE = "rr_oauth_next";

/** How long a started login may take to finish. */
export const OAUTH_STATE_TTL_SECONDS = 60 * 10;

/** A fresh, unguessable OAuth `state` value. */
export function createState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Whether two state values match, in constant time.
 *
 * `timingSafeEqual` throws on differing lengths, so the lengths are compared
 * first — that comparison leaks only the length, which is fixed at 43 for a
 * 32-byte base64url value and carries no secret.
 */
export function statesMatch(expected: string, received: string | null): boolean {
  if (received === null) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The result of redeeming an authorization code. */
export type TokenResult =
  | { readonly ok: true; readonly accessToken: string; readonly scope: string }
  | { readonly ok: false; readonly reason: "exchange_failed" | "malformed_response"; readonly status: number | null };

/** Everything `exchangeCode` needs. */
export interface ExchangeCodeInput {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly code: string;
  readonly redirectUri: string;
  /** Injected for tests; defaults to the platform `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Redeems an authorization code for an access token.
 *
 * The token endpoint answers with JSON when asked (the `Accept` header), rather
 * than the default URL-encoded body, so the response is validated as an object
 * with a string `access_token`. A 200 with no token is a malformed response, not
 * a success, and is reported as such.
 */
export async function exchangeCode(input: ExchangeCodeInput): Promise<TokenResult> {
  const fetchImpl = input.fetchImpl ?? fetch;

  const response = await fetchImpl(tokenUrl(), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });

  if (!response.ok) {
    return { ok: false, reason: "exchange_failed", status: response.status };
  }

  const body = (await response.json()) as Record<string, unknown>;
  const accessToken = body.access_token;

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return { ok: false, reason: "malformed_response", status: response.status };
  }

  return {
    ok: true,
    accessToken,
    scope: typeof body.scope === "string" ? body.scope : "",
  };
}

/**
 * Reads the authenticated user with the access token.
 *
 * This is the ownership proof: the login returned here is the account the token
 * belongs to, which is what the claim compares against.
 */
export async function fetchIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubIdentity | null> {
  const response = await fetchImpl(userUrl(), {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "x-github-api-version": API_VERSION,
      "user-agent": "RootRealm-Auth",
    },
  });

  if (!response.ok) return null;

  const body = (await response.json()) as Record<string, unknown>;
  const login = body.login;
  const id = body.id;

  if (typeof login !== "string" || typeof id !== "number") return null;

  return {
    login,
    githubId: id,
    name: typeof body.name === "string" ? body.name : null,
    avatarUrl: typeof body.avatar_url === "string" ? body.avatar_url : null,
  };
}

/**
 * A non-reversible tag for a token, for correlation without exposure.
 *
 * A token must never be logged. When an operator needs to know *which* token a
 * record refers to, this gives a stable tag that cannot be turned back into the
 * token. It is a plain SHA-256, not a password hash, because the input is
 * already high-entropy and the goal is correlation, not brute-force resistance.
 */
export function tokenFingerprint(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
}
