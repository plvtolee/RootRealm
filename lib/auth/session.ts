/**
 * RootRealm — signed sessions (TASKS 9.1 and 9.2).
 *
 * ```text
 * verified identity → signed session cookie → identified requests
 * ```
 *
 * A session is what makes a claimed profile persistent. It is a value the
 * browser holds that the server can trust without storing a session per user,
 * which matters here because there is no database until Phase 10.
 *
 * ## Why a signed token and not a random id
 *
 * A random session id needs a server-side store to mean anything; without
 * Phase 10 there is none. A compact signed token is self-describing: the server
 * re-derives the signature on each request and knows the payload is its own,
 * statelessly. The trade-off is real and worth naming — the token cannot be
 * revoked before it expires without a deny-list — so the lifetime is short
 * (7 days) and it carries the minimum: a user id and an issue time. No token,
 * no refresh token, no email.
 *
 * ## Why HMAC and not an unsigned JSON cookie
 *
 * The payload identifies the user. Unsigned, anyone could set
 * `userId=someone-else` and be treated as them. HMAC-SHA256 over the payload
 * with a server secret makes that forgery infeasible, and `timingSafeEqual`
 * makes the check not leak the correct signature byte by byte.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** The data a session carries. Deliberately minimal. */
export interface SessionPayload {
  /** RootRealm's own user id, not the GitHub id. */
  readonly userId: string;
  /** Issued-at, epoch seconds. */
  readonly issuedAt: number;
  /** Expiry, epoch seconds. */
  readonly expiresAt: number;
}

/** The default lifetime: seven days. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** The cookie name the session is carried in. */
export const SESSION_COOKIE = "rr_session";

export interface SessionOptions {
  /** The signing secret. Required: an unsigned session is not a session. */
  readonly secret: string;
  /** Injectable clock, epoch milliseconds. */
  readonly now?: () => number;
}

/** Raised when a session cannot be trusted. */
export class SessionError extends Error {}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(payloadPart: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

/** Issues a signed session value for a user. */
export function issueSession(
  userId: string,
  options: SessionOptions,
): { value: string; payload: SessionPayload } {
  const now = options.now?.() ?? Date.now();
  const payload: SessionPayload = {
    userId,
    issuedAt: Math.floor(now / 1000),
    expiresAt: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  };

  const payloadPart = base64url(JSON.stringify(payload));
  const signature = sign(payloadPart, options.secret);

  return { value: `${payloadPart}.${signature}`, payload };
}

/**
 * Verifies and decodes a session value.
 *
 * Returns the payload, or throws {@link SessionError} for a malformed,
 * mis-signed or expired value. Throwing rather than returning null is
 * deliberate: every caller must handle "not signed in", and a null a caller
 * forgets to check reads as "signed in as nobody" instead of "reject".
 */
export function verifySession(value: string | null | undefined, options: SessionOptions): SessionPayload {
  if (value === null || value === undefined || value.length === 0) {
    throw new SessionError("No session cookie was presented.");
  }

  const separator = value.lastIndexOf(".");
  if (separator <= 0) {
    throw new SessionError("The session cookie is malformed.");
  }

  const payloadPart = value.slice(0, separator);
  const presented = value.slice(separator + 1);
  const expected = sign(payloadPart, options.secret);

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new SessionError("The session signature is not valid.");
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    throw new SessionError("The session payload is not readable.");
  }

  if (
    typeof payload.userId !== "string" ||
    typeof payload.issuedAt !== "number" ||
    typeof payload.expiresAt !== "number"
  ) {
    throw new SessionError("The session payload is missing required fields.");
  }

  const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
  if (payload.expiresAt <= nowSeconds) {
    throw new SessionError("The session has expired.");
  }

  return payload;
}

/**
 * The cookie attributes for a session.
 *
 * `httpOnly` keeps the value away from scripts, `sameSite: "lax"` still allows
 * the top-level redirect back from GitHub while blocking cross-site POSTs, and
 * `secure` is set in production. These are not decorations: each one closes a
 * class of session theft.
 */
export function sessionCookieAttributes(isProduction: boolean): string {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    isProduction ? "Secure" : "",
  ]
    .filter((part) => part.length > 0)
    .join("; ");
}