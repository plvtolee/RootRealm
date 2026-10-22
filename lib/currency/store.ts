/**
 * RootRealm — the wallet store (TASKS 15.3 and 15.4).
 *
 * ```text
 * a user's ledger + inventory + equipped set, read and written as one unit
 * ```
 *
 * A purchase is only atomic if nothing can read the balance, decide, and then
 * find the balance changed underneath it. `purchaseCosmetic` (TASKS 14.4) is pure,
 * so it needs a caller that holds the two writes together — that caller is this
 * store, and the interface is here so Phase 10's database can replace it without
 * a single route changing.
 *
 * ## Where the atomicity actually is
 *
 * Every method here reads the current wallet, decides, and writes the new wallet
 * with **no `await` in between**. In a single-threaded runtime that makes the
 * read-decide-write sequence indivisible with respect to other requests: a
 * concurrent purchase cannot interleave between "can this developer afford it"
 * and "write the spend". The rule a future SQL implementation must preserve is
 * the same one — the check and the two writes belong in one transaction, and
 * `SELECT`ing the balance, then deciding, then writing is the bug this shape is
 * shaped to prevent.
 *
 * ## Why the in-memory implementation is explicit about being one
 *
 * It loses everything on restart, exactly like the account store in Phase 9. It
 * is here so the shop's server boundary is real and testable now, not so the
 * product has storage.
 */
import { COSMETIC_INDEX, DEFAULT_OWNED_IDS } from "../cosmetics/catalog";
import type { CosmeticIndex, CosmeticSlot } from "../cosmetics/definition";
import {
  equipCosmetic,
  equipOwnedDefaults,
  unequipCosmetic,
  type EquipOutcome,
  type EquippedCosmetics,
} from "../cosmetics/equip";
import { grantFromQuestCompletion, initialInventory, type Inventory } from "../cosmetics/inventory";
import type { CosmeticGrant } from "../quests/completion";

import { balanceOf, type CurrencyTransaction } from "./ledger";
import { purchaseCosmetic, type PurchaseOutcome } from "./purchase";

/** Everything one developer holds in the shop economy. */
export interface Wallet {
  readonly userId: string;
  /** The append-only coin ledger (TASKS 14.1). */
  readonly transactions: readonly CurrencyTransaction[];
  /** What the developer owns (TASKS 13.2). */
  readonly inventory: Inventory;
  /** What they are wearing (TASKS 13.3). */
  readonly equipped: EquippedCosmetics;
}

/** The coin balance, named where a screen needs it. */
export function walletBalance(wallet: Wallet): number {
  return balanceOf(wallet.transactions, wallet.userId);
}

/** How a wallet store is read and written. Phase 10 supplies the SQL one. */
export interface WalletStore {
  /** The current wallet. A user who has never been seen gets the starter one. */
  read(userId: string): Promise<Wallet>;
  /** Charges for an item and grants it, or refuses. All or neither. */
  purchase(input: { readonly userId: string; readonly itemId: string; readonly at: string }): Promise<PurchaseOutcome>;
  /** Puts an owned item on. Never grants, never charges. */
  equip(input: { readonly userId: string; readonly itemId: string }): Promise<EquipOutcome>;
  /** Takes an item off. The item stays owned. */
  unequip(input: { readonly userId: string; readonly slot: CosmeticSlot }): Promise<EquippedCosmetics>;
  /** Applies idempotent completion rewards to the wallet. */
  grant(input: {
    readonly userId: string;
    readonly transaction: CurrencyTransaction | null;
    readonly cosmeticGrant: CosmeticGrant | null;
    readonly at: string;
  }): Promise<void>;
  /** Replaces the whole wallet. Used by seeding and tests. */
  save(wallet: Wallet): Promise<Wallet>;
}

/**
 * A wallet for a developer who has none yet.
 *
 * The starter set is granted and worn, and the balance is whatever the seed says
 * it is — nothing is invented here beyond the zero-price basics.
 */
export function newWallet(
  userId: string,
  at: string,
  transactions: readonly CurrencyTransaction[] = [],
  index: CosmeticIndex = COSMETIC_INDEX,
): Wallet {
  const inventory = initialInventory(userId, at, index);
  return {
    userId,
    transactions,
    inventory,
    equipped: equipOwnedDefaults(inventory, DEFAULT_OWNED_IDS, index),
  };
}

/**
 * An in-memory wallet store.
 *
 * Not durable — see the module header. It exists so the shop's server boundary
 * is real now and Phase 10 replaces it without touching the routes.
 */
export function createInMemoryWalletStore(seed: readonly Wallet[] = []): WalletStore {
  const byUser = new Map<string, Wallet>();
  for (const wallet of seed) byUser.set(wallet.userId, wallet);

  function current(userId: string, at: string): Wallet {
    return byUser.get(userId) ?? newWallet(userId, at);
  }

  return {
    async read(userId) {
      return current(userId, new Date(0).toISOString());
    },

    async save(wallet) {
      byUser.set(wallet.userId, wallet);
      return wallet;
    },

    async purchase({ userId, itemId, at }) {
      // Synchronous from here to the write: nothing awaits between deciding and
      // committing, so no other request can slip a purchase in between.
      const wallet = current(userId, at);
      const outcome = purchaseCosmetic({
        userId,
        itemId,
        inventory: wallet.inventory,
        transactions: wallet.transactions,
        at,
      });

      if (!outcome.ok) return outcome;

      byUser.set(userId, { ...wallet, inventory: outcome.inventory, transactions: outcome.transactions });
      return outcome;
    },

    async equip({ userId, itemId }) {
      const wallet = current(userId, new Date(0).toISOString());
      const outcome = equipCosmetic(wallet.inventory, wallet.equipped, itemId);

      if (!outcome.ok) return outcome;

      byUser.set(userId, { ...wallet, equipped: outcome.equipped });
      return outcome;
    },

    async unequip({ userId, slot }) {
      const wallet = current(userId, new Date(0).toISOString());
      const equipped = unequipCosmetic(wallet.equipped, slot);
      byUser.set(userId, { ...wallet, equipped });
      return equipped;
    },

    async grant({ userId, transaction, cosmeticGrant, at }) {
      const wallet = current(userId, new Date(0).toISOString());
      const transactions =
        transaction === null || wallet.transactions.some((entry) => entry.id === transaction.id)
          ? wallet.transactions
          : [...wallet.transactions, transaction];
      const inventory =
        cosmeticGrant === null
          ? wallet.inventory
          : grantFromQuestCompletion(wallet.inventory, cosmeticGrant, at).inventory;

      byUser.set(userId, { ...wallet, transactions, inventory });
    },
  };
}

/**
 * The process-wide wallet store.
 *
 * Held on `globalThis` rather than in a module-level `const`, because Next
 * compiles every route entry — a page and a route handler are separate bundles —
 * and each bundle gets its own copy of a module-scoped variable. Two bundles
 * would mean two wallets: the shop page would show a balance of zero for a
 * developer who had just bought something through the API, which is exactly the
 * bug this arrangement exists to prevent. `globalThis` is the one object those
 * bundles share.
 *
 * Phase 10 deletes this function along with the rest of the in-memory layer; the
 * `WalletStore` interface is what survives it.
 */
const GLOBAL_KEY = "__rootrealm_wallet_store__";

type GlobalWithWallet = typeof globalThis & { [GLOBAL_KEY]?: WalletStore };

/** The shared store, created on first use. */
export function walletStore(): WalletStore {
  const scope = globalThis as GlobalWithWallet;
  scope[GLOBAL_KEY] ??= createInMemoryWalletStore();
  return scope[GLOBAL_KEY] as WalletStore;
}
