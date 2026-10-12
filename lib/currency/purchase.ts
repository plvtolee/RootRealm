/**
 * RootRealm — the CodeCoin purchase flow (TASKS 14.4).
 *
 * ```text
 * inventory + ledger → a charged, granted purchase, or a refusal with no writes
 * ```
 *
 * TASKS 14.4 asks for *atomic* cosmetic purchases and lists four things that must
 * hold. This module is where each of them is decided:
 *
 * - **insufficient balance rejected** — the spend is checked against the balance
 *   at the moment of the decision, before anything is produced.
 * - **successful purchase grants ownership** — the item is granted in the same
 *   outcome that charges for it, so "paid but not owned" is not a reachable state
 *   from this function.
 * - **duplicate request does not deduct twice** — the spend is keyed
 *   `cc:<userId>:cosmetic_purchase:<itemId>` and an item already owned is refused
 *   outright, so a double-clicked Buy is a refusal rather than a second charge.
 * - **failed transaction does not corrupt balance** — a refusal carries no writes
 *   at all, and a success carries both writes together.
 *
 * ## What "atomic" means here, precisely
 *
 * There is no database driver in this repository yet (TASKS 10.1 chose the
 * deployment target first), so atomicity is expressed as a *shape*: the function
 * either returns the complete next state — the new inventory **and** the ledger
 * with the spend appended — or returns a refusal and nothing else. It never
 * mutates its inputs and never returns a spend without the grant. When a driver
 * lands, the caller writes both rows in one transaction and nothing about the
 * decision changes.
 *
 * ## Why the balance check is not the ledger's job
 *
 * `canAfford` (TASKS 14.2) computes whether an amount is affordable and this
 * module decides. The split matters: a check followed later by a write is a race,
 * so the two live in one function that produces both or neither.
 *
 * ## Why CodeCoins cannot buy anything else
 *
 * SCORING.md §29: CodeCoins purchase visual items, never skill nodes. The
 * signature takes a cosmetic id and resolves it through the cosmetic index, so
 * there is no argument this function accepts that names a skill. A currency
 * system that could spend on progression is a different product, and the type is
 * where that difference is enforced.
 */
import { COSMETIC_INDEX } from "../cosmetics/catalog";
import type { CosmeticIndex } from "../cosmetics/definition";
import { grantCosmetic, ownsCosmetic, type Inventory } from "../cosmetics/inventory";

import {
  balanceOf,
  canAfford,
  currencyKey,
  recordCurrencyTransaction,
  type CurrencyTransaction,
} from "./ledger";

/** Why a purchase was refused. */
export type PurchaseRefusal =
  /** No such item in the catalog. */
  | "unknown_item"
  /** A quest reward or other non-purchasable item; it is acquired, not bought. */
  | "not_purchasable"
  /** Already owned. A repeat request is refused, never charged again. */
  | "already_owned"
  /** The balance at this moment does not cover the price. */
  | "insufficient_balance"
  /**
   * The ledger already holds this item's purchase entry but the inventory does
   * not own it.
   *
   * A state that should be unreachable — it means a charge was persisted and the
   * grant was not. It is refused rather than charged again, because the developer
   * has already paid; re-charging is the one response that cannot be defended, and
   * the inconsistency is left visible for an operator to reconcile.
   */
  | "already_charged";

/** A successful purchase: both writes, and nothing else. */
export interface PurchaseSuccess {
  readonly ok: true;
  readonly itemId: string;
  /** What was charged. Zero for a free item, which writes no ledger entry. */
  readonly cost: number;
  /** The inventory after the grant. */
  readonly inventory: Inventory;
  /** The ledger after the spend, in full. */
  readonly transactions: readonly CurrencyTransaction[];
  /** The balance after the spend. */
  readonly balance: number;
}

/** A refused purchase: a reason and no state at all. */
export interface PurchaseRefused {
  readonly ok: false;
  readonly refusal: PurchaseRefusal;
  /** What the item costs, when it is purchasable — for a "you need N more" message. */
  readonly cost: number | null;
  /** The balance at the moment of refusal. */
  readonly balance: number;
}

export type PurchaseOutcome = PurchaseSuccess | PurchaseRefused;

/**
 * Buys one cosmetic with CodeCoins.
 *
 * Pure: the inputs are not mutated and every write is returned rather than
 * applied. See the module header for how atomicity is expressed without a
 * database.
 */
export function purchaseCosmetic(input: {
  readonly userId: string;
  readonly itemId: string;
  readonly inventory: Inventory;
  readonly transactions: readonly CurrencyTransaction[];
  /** When the purchase is recorded, ISO-8601. Caller-owned, for determinism. */
  readonly at: string;
  readonly index?: CosmeticIndex;
}): PurchaseOutcome {
  const index = input.index ?? COSMETIC_INDEX;
  const balance = balanceOf(input.transactions, input.userId);

  const definition = index.byId.get(input.itemId);
  if (definition === undefined) {
    return { ok: false, refusal: "unknown_item", cost: null, balance };
  }

  // Null price is the catalog's statement that the item is acquired rather than
  // bought. A `0` price would make a quest reward purchasable for nothing, so
  // the zero-price basics are the purchasable ones and the distinction is the
  // rule rather than a special case for free items.
  if (definition.priceCodeCoins === null) {
    return { ok: false, refusal: "not_purchasable", cost: null, balance };
  }

  const cost = definition.priceCodeCoins;

  if (ownsCosmetic(input.inventory, input.itemId)) {
    return { ok: false, refusal: "already_owned", cost, balance };
  }

  if (!canAfford(input.transactions, input.userId, cost)) {
    return { ok: false, refusal: "insufficient_balance", cost, balance };
  }

  // A zero-price purchase has no ledger entry at all: the ledger deliberately
  // refuses a zero-amount transaction as noise, so "nothing was written" is the
  // correct outcome here rather than the signal that the item is already paid
  // for. Only a priced purchase can be a repeat charge.
  const alreadyCharged =
    cost > 0 &&
    input.transactions.some(
      (transaction) =>
        transaction.id === currencyKey(input.userId, "cosmetic_purchase", input.itemId),
    );

  if (alreadyCharged) {
    return { ok: false, refusal: "already_charged", cost, balance };
  }

  const spend =
    cost === 0
      ? null
      : recordCurrencyTransaction(
          {
            userId: input.userId,
            amount: -cost,
            reason: "cosmetic_purchase",
            sourceId: input.itemId,
            recordedAt: input.at,
          },
          { has: (key) => input.transactions.some((transaction) => transaction.id === key) },
        );

  const grant = grantCosmetic(
    input.inventory,
    { itemId: input.itemId, sourceKind: "purchase", sourceId: input.itemId, acquiredAt: input.at },
    index,
  );

  const transactions = spend === null ? [...input.transactions] : [...input.transactions, spend];

  return {
    ok: true,
    itemId: input.itemId,
    cost,
    inventory: grant.inventory,
    transactions,
    balance: balanceOf(transactions, input.userId),
  };
}