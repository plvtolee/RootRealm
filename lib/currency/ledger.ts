/**
 * RootRealm — the CodeCoin ledger (TASKS 14.1 and 14.2).
 *
 * ```text
 * balance = the sum of an append-only ledger
 * ```
 *
 * TASKS 14.1 asks for immutable currency transactions; TASKS 14.2 asks for the
 * balance. The second is a consequence of the first: a balance that is *derived*
 * by summing the ledger cannot drift from it, whereas a `coins` column updated in
 * place can — and when it does, there is no record to reconcile against.
 *
 * ## Why the ledger is append-only, and transactions are keyed
 *
 * A currency ledger's job is to be a record that a reader can trust. An entry is
 * never edited and never deleted: a correction is a compensating entry, because
 * the history of what was granted and spent is the thing being protected. And
 * because an entry can be produced by a retried operation — a quest completion
 * re-delivered, a purchase re-submitted — every entry carries an **idempotency
 * key**. Uniqueness of that key is what makes a retry a no-op, exactly as the XP
 * idempotency key does (SCORING.md §18).
 *
 * ## Why there are no negative balances checked here
 *
 * `balance` may be computed from any ledger. Whether a *spend* is allowed is a
 * decision that needs the balance at the moment of spending, and it belongs to
 * the purchase flow (TASKS 14.4), where it can be atomic with the write. Checking
 * it here would be a check followed later by a write — a race. This module
 * computes; 14.4 decides.
 */
import type { Account } from "../auth/account";

/** The reason a currency entry exists. A closed set, so a ledger is explainable. */
export type CurrencyReason =
  /** A quest completion (TASKS 12.3). */
  | "quest_completion"
  /** An achievement reward (TASKS 14.3). */
  | "achievement_reward"
  /** A cosmetic purchase (TASKS 14.4). */
  | "cosmetic_purchase"
  /** A season reward. */
  | "season_reward"
  /** An operator correction. Always paired with a compensating entry. */
  | "adjustment";

/** One immutable ledger entry. */
export interface CurrencyTransaction {
  /**
   * The idempotency key: `cc:<userId>:<source>:<sourceId>`.
   *
   * Uniqueness of this key is the mechanism by which a repeated operation cannot
   * spend or grant twice (TASKS 14.4's "duplicate request does not deduct twice").
   */
  readonly id: string;
  readonly userId: string;
  /** Positive to grant, negative to spend. Never zero. */
  readonly amount: number;
  readonly reason: CurrencyReason;
  /** The id of the thing that caused it — a quest id, an item id. */
  readonly sourceId: string;
  /** When it was recorded, ISO-8601. Caller-owned, for determinism. */
  readonly recordedAt: string;
}

/** Builds the idempotency key. The one place its shape is decided. */
export function currencyKey(userId: string, reason: CurrencyReason, sourceId: string): string {
  return `cc:${userId}:${reason}:${sourceId}`;
}

/**
 * Creates a ledger entry, or reports that one already exists.
 *
 * Returns null for a duplicate rather than throwing: a re-delivered completion is
 * a true statement about the world ("already granted"), not an error. Returns
 * null for a zero amount too — a zero-coin entry is noise in a ledger whose job
 * is to explain a balance.
 */
export function recordCurrencyTransaction(
  input: {
    readonly userId: string;
    readonly amount: number;
    readonly reason: CurrencyReason;
    readonly sourceId: string;
    readonly recordedAt: string;
  },
  existing: { readonly has: (key: string) => boolean },
): CurrencyTransaction | null {
  if (input.amount === 0) return null;

  const id = currencyKey(input.userId, input.reason, input.sourceId);
  if (existing.has(id)) return null;

  return {
    id,
    userId: input.userId,
    amount: input.amount,
    reason: input.reason,
    sourceId: input.sourceId,
    recordedAt: input.recordedAt,
  };
}

/**
 * The balance: the sum of the ledger, floored at zero.
 *
 * The floor is defensive, not corrective. A ledger that sums negative is a bug
 * somewhere else, and reporting a negative balance would present that bug to a
 * developer as "you owe coins". Zero is the honest lower bound for a balance that
 * should never have gone below it, and the ledger still holds the evidence.
 */
export function balanceOf(
  transactions: readonly CurrencyTransaction[],
  userId: string,
): number {
  let total = 0;
  for (const transaction of transactions) {
    if (transaction.userId === userId) total += transaction.amount;
  }
  return Math.max(0, total);
}

/** A balance with its supporting entries, for a ledger view. */
export interface BalanceStatement {
  readonly userId: string;
  readonly balance: number;
  readonly entries: readonly CurrencyTransaction[];
}

/** Builds a developer's statement, newest entry first. */
export function statementFor(
  transactions: readonly CurrencyTransaction[],
  userId: string,
): BalanceStatement {
  const entries = transactions
    .filter((transaction) => transaction.userId === userId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : 0));

  return { userId, balance: balanceOf(transactions, userId), entries };
}

/**
 * Whether a spend is affordable.
 *
 * Exposed separately from any write so the purchase flow can decide atomically,
 * and so the rule has exactly one definition (TASKS 14.4's "insufficient balance
 * rejected").
 */
export function canAfford(
  transactions: readonly CurrencyTransaction[],
  userId: string,
  amount: number,
): boolean {
  if (amount < 0) return false;
  return balanceOf(transactions, userId) >= amount;
}

/**
 * The user id a ledger operation belongs to.
 *
 * A tiny adapter so callers pass the account, not a string they could get wrong.
 */
export function ledgerUserOf(account: Pick<Account, "id">): string {
  return account.id;
}