/**
 * RootRealm — `DELETE /api/account` (TASKS 22.5).
 *
 * ```text
 * a confirmed request from a signed-in developer → the account is gone
 * ```
 *
 * ## Why DELETE and not POST
 *
 * The verb is the honest description and it is load-bearing: a deletion is not
 * something a `<img>` tag, a prefetch or a crawler can trigger, which is the same
 * reason `/api/auth/logout` is a POST. A GET that deletes is a bug waiting to be
 * found by someone's browser history.
 *
 * ## Why the cookie is cleared on every outcome
 *
 * A session that outlives its account is a session pointing at nothing. Clearing
 * it on success and on "no such account" alike means there is no path where the
 * browser keeps a credential the server will always reject — and `/api/profile/me`
 * treats that state as signed-out anyway, so this is belt to that braces.
 *
 * ## What the response does not claim
 *
 * A 200 here means the account row is gone. It does not mean anything about the
 * developer's GitHub account, which RootRealm has no authority over and which
 * must be revoked at github.com if they want it gone.
 */
import { SESSION_COOKIE } from "@/lib/auth/session";
import { DELETE_CONFIRMATION, deleteAccount } from "@/lib/auth/delete-account";
import { accountStore } from "@/lib/db/stores";
import { safeJson } from "@/lib/security/server";
import { userIdFromCookieHeader } from "@/lib/shop/service";
import { serviceLogger } from "@/lib/ops/monitoring";

export const dynamic = "force-dynamic";

/** Clears the session cookie. `Max-Age=0` is what removes it. */
const CLEAR_COOKIE = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** `DELETE /api/account` with `{ confirmation: "delete my account" }`. */
export async function DELETE(request: Request): Promise<Response> {
  const logger = serviceLogger("account");
  const body = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;

  // The phrase is read as an unknown and handed to the decision, which compares it
  // exactly. Validating it here as well would be a second rule to keep in step.
  const confirmation = typeof body?.confirmation === "string" ? body.confirmation : null;

  const outcome = await deleteAccount({
    userId: userIdFromCookieHeader(request.headers.get("cookie")),
    confirmation,
    store: accountStore(),
  });

  if (!outcome.ok) {
    // A refused deletion still clears the cookie for the "not_found" case, where
    // the cookie names an account that is already gone.
    const status = outcome.refusal === "unauthenticated" ? 401 : 400;

    if (outcome.refusal === "unauthenticated") {
      logger.warn("account.deletion_unauthenticated", { });
    } else {
      logger.warn("account.deletion_refused", { refusal: outcome.refusal });
    }

    return safeJson(
      {
        error: outcome.refusal,
        message: messageFor(outcome.refusal),
      },
      {
        status,
        ...(outcome.refusal === "not_found" ? { headers: { "set-cookie": CLEAR_COOKIE } } : {}),
      },
    );
  }

  logger.warn("account.deleted", { userId: outcome.userId, login: outcome.login });

  return safeJson(
    {
      deleted: true,
      login: outcome.login,
      // Said plainly, because there is no restore and pretending otherwise is how
      // a user discovers the truth a week later.
      irreversible: true,
      confirmation: DELETE_CONFIRMATION,
    },
    { status: 200, headers: { "set-cookie": CLEAR_COOKIE } },
  );
}

/** User-safe wording. Never contains an id the requester did not already hold. */
function messageFor(refusal: string): string {
  if (refusal === "unauthenticated") {
    return "Sign in to delete your account.";
  }
  if (refusal === "not_found") {
    return "That account no longer exists.";
  }
  return `This cannot be undone. To confirm, send {"confirmation":"${DELETE_CONFIRMATION}"}.`;
}