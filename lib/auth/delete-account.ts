/**
 * RootRealm — account deletion (TASKS 22.5).
 *
 * ```text
 * a signed-in developer → their account and everything derived from it, gone
 * ```
 *
 * ## Why this is irreversible and says so
 *
 * Deletion here is a hard delete, not a soft one. There is no `deleted_at` column
 * and no restore path, because a restore path for a *deletion* request is a
 * feature nobody asked for and a promise the product cannot keep — once a
 * developer has asked to be forgotten, "we kept it for 30 days" is not a
 * kindness, it is the opposite.
 *
 * So the surrounding design assumes one-way: the route requires an explicit typed
 * confirmation, the UI requires a second deliberate click, and the response says
 * plainly that it cannot be undone. What the schema does is cascade — ten tables
 * reference `users`, and the foreign keys declare `ON DELETE CASCADE`, so one
 * delete removes the account and every row derived from it in the same statement.
 * That is why this is safe to implement at all: there is no second store to clean
 * up and forget.
 *
 * ## What is deliberately *not* deleted
 *
 * The OAuth token is never stored (TASKS 9.4), so there is nothing to revoke
 * locally. The developer's **GitHub account is not touched** — RootRealm holds no
 * authority over it, and deleting here must not be mistaken for revoking GitHub's
 * own consent, which can only be done at github.com.
 */
import type { AccountStore } from "../auth/account";

/** Why a deletion did not happen. */
export type DeletionRefusal =
  /** No trusted session: this request belongs to nobody. */
  | "unauthenticated"
  /** The caller did not send the exact confirmation phrase. */
  | "not_confirmed"
  /** The session names an account that is no longer there. */
  | "not_found";

/** The phrase a caller must send. Long and awkward on purpose: a mis-click must not delete. */
export const DELETE_CONFIRMATION = "delete my account";

export type DeletionOutcome =
  | { readonly ok: true; readonly userId: string; readonly login: string }
  | { readonly ok: false; readonly refusal: DeletionRefusal };

/**
 * How an account is removed.
 *
 * An interface rather than a direct query so the decision above is testable
 * without a database, and so a store that cannot delete (an in-memory one) says
 * so plainly instead of pretending.
 */
export interface DeletableAccountStore extends AccountStore {
  /**
   * Removes the account. Returns false when there was nothing to remove, which is
   * the honest answer for a second request rather than a silent success.
   */
  remove(userId: string): Promise<boolean>;
}

/**
 * Deletes an account.
 *
 * The confirmation is checked here rather than in the route, so that the rule "a
 * deletion must be confirmed" belongs to the operation and not to one caller. A
 * second route that forgot to check could not delete anything.
 */
export async function deleteAccount(input: {
  readonly userId: string | null;
  readonly confirmation: string | null;
  readonly store: DeletableAccountStore;
}): Promise<DeletionOutcome> {
  if (input.userId === null) return { ok: false, refusal: "unauthenticated" };

  // Exact match, trimmed, case-sensitive: "Delete my account" and "yes" are not
  // confirmations, and a fuzzy match would let either through.
  if (input.confirmation?.trim() !== DELETE_CONFIRMATION) {
    return { ok: false, refusal: "not_confirmed" };
  }

  const account = await input.store.findById(input.userId);

  if (account === null) {
    // A valid session for an account that is gone. Distinct from unauthenticated
    // so the caller can clear the cookie rather than pretend someone is signed in.
    return { ok: false, refusal: "not_found" };
  }

  await input.store.remove(input.userId);

  return { ok: true, userId: account.id, login: account.login };
}