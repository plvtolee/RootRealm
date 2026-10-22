/**
 * RootRealm — `GET /api/profile/me` (TASKS 9.1, 8.2).
 *
 * ```text
 * the session cookie → the GitHub login it belongs to, or nothing
 * ```
 *
 * The screens that show a character (profile, skill tree, achievements) need to
 * know *whose* to load. Before this existed, a page had either hardcode a login or
 * ask the visitor to type one — which is how `/profile` came to render a static
 * mock while the live lookup showed a real character, and how the three could disagree.
 *
 * ## Why the answer is a login and not a whole profile
 *
 * The identity is the only thing the session knows. Everything else — the events,
 * the aggregate, the achievements — comes from GitHub and is the same for a guest
 * and a signed-in developer looking at the same login. Returning just the login
 * keeps this endpoint to one indexed lookup on `users.id` and leaves the
 * ingestion to the single endpoint every screen already shares.
 *
 * ## Why signed-out is 200 and not 401
 *
 * A 401 would tell the browser "this is an error", and a signed-out visitor is not
 * an error — the preview is a documented feature. So the answer is always a
 * success with the login `null`, which lets the caller render the signed-out state
 * instead of a failure.
 */
import { readSessionSecret } from "@/lib/auth/config";
import { SESSION_COOKIE, SessionError, verifySession } from "@/lib/auth/session";
import { accountStore } from "@/lib/db/stores";
import { safeJson } from "@/lib/security/server";

export const dynamic = "force-dynamic";

/** Reads one cookie value from a `Cookie` header. */
function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** `GET /api/profile/me` → `{ login: string | null, userId: string | null }`. */
export async function GET(request: Request): Promise<Response> {
  const secret = readSessionSecret();

  // No secret configured means no session can be trusted, which is the same
  // answer as no cookie: nobody is signed in.
  if (secret === null) return safeJson({ login: null, userId: null });

  let userId: string | null = null;

  try {
    userId = verifySession(readCookie(request.headers.get("cookie"), SESSION_COOKIE), { secret })
      .userId;
  } catch (error) {
    // An absent, malformed, mis-signed or expired cookie are all one answer:
    // this request belongs to nobody. `SessionError` covers all four.
    if (!(error instanceof SessionError)) throw error;
    return safeJson({ login: null, userId: null });
  }

  // A session for an account that is gone (a restored database, a deleted user)
  // is also nobody: the cookie is valid but the claim behind it no longer exists.
  const account = await accountStore().findById(userId);
  return safeJson({ login: account?.login ?? null, userId: account === null ? null : account.id });
}
