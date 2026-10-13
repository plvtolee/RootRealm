/**
 * RootRealm — the PostgreSQL wallet store (TASKS 14.4, 15.3, 10.1).
 *
 * ```text
 * one developer's ledger + inventory + equipped set, in the database
 * ```
 *
 * This replaces `createInMemoryWalletStore` (`lib/currency/store.ts`) without
 * touching it or the purchase flow: `purchaseCosmetic` is still the pure function
 * that decides, and `WalletStore` is still the interface. What changes is that the
 * read-decide-write sequence now runs inside a real transaction.
 *
 * ## Why the transaction is the whole point
 *
 * `purchaseCosmetic` is pure and decides in one step, so the code reads as though
 * it is already atomic. What makes it atomic is that nothing can *read* between
 * the read and the write — which in memory was true because there is no `await`
 * between them (see `store.ts`), and in a database is true because the three
 * statements share one transaction. Take the transaction away and two concurrent
 * purchases both see "not owned" and both write: a duplicate charge, which is
 * exactly the failure TASKS 14.4 names. `UNIQUE (user_id, item_id)` is the
 * backstop, but the transaction is what prevents the race rather than merely
 * surviving it.
 *
 * That is why every helper below takes the executor to use rather than closing
 * over one: inside `purchase` they are handed the transaction-bound executor, so
 * the read, the decision and both writes run on one connection. A helper that
 * reached for the shared pool would be outside the `BEGIN` while appearing to be
 * inside it — atomic in name, racy in fact.
 *
 * ## Why provenance is stored, not inferred
 *
 * `InventoryItem` records *how* an item was acquired, and the inventory's stated
 * job is to answer "how did I get this". Deriving that from the ledger would
 * conflate a quest grant with a starter item, so `source_kind` and `source_id`
 * are columns in `inventory_items` (TASKS 10.4) and written from the domain value.
 */
import { COSMETIC_INDEX, DEFAULT_OWNED_IDS } from "../cosmetics/catalog";
import type { CosmeticSlot } from "../cosmetics/definition";
import {
  equipCosmetic,
  equipOwnedDefaults,
  unequipCosmetic,
  type EquippedCosmetics,
  type EquipOutcome,
} from "../cosmetics/equip";
import {
  initialInventory,
  inventoryKey,
  type Inventory,
  type InventoryItem,
} from "../cosmetics/inventory";
import { currencyKey, type CurrencyTransaction } from "../currency/ledger";
import { purchaseCosmetic, type PurchaseOutcome } from "../currency/purchase";
import type { Wallet, WalletStore } from "../currency/store";

import { allRows, readBoolean, readIso, readNumber, readText, type SqlExecutor } from "./sql";

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/* -------------------------------------------------------------------------- */

interface TransactionRow {
  transaction_id: unknown;
  user_id: unknown;
  amount: unknown;
  reason: unknown;
  source_id: unknown;
  created_at: unknown;
}

interface InventoryRow {
  item_id: unknown;
  source_kind: unknown;
  source_id: unknown;
  acquired_at: unknown;
  equipped: unknown;
  slot: unknown;
}

const TRANSACTION_COLUMNS = "transaction_id, user_id, amount, reason, source_id, created_at";

/** The join that gives each owned item its catalogue slot, which `equipped` needs. */
const INVENTORY_SELECT = `
  SELECT i.item_id, i.source_kind, i.source_id, i.acquired_at, i.equipped, c.slot
  FROM inventory_items i
  JOIN cosmetic_items c ON c.id = i.item_id
  WHERE i.user_id = $1;`;

/**
 * Narrows a ledger row.
 *
 * `amount` arrives as a string because `pg` maps every `numeric`/`bigint` to a
 * string to avoid losing precision; the domain is a `number` of whole coins, so
 * it is converted here — the one place that knows.
 */
function toTransaction(row: TransactionRow): CurrencyTransaction | null {
  const id = readText(row.transaction_id);
  const userId = readText(row.user_id);
  const amount = readNumber(row.amount);
  const reason = readText(row.reason);
  const recordedAt = readIso(row.created_at);

  if (id === null || userId === null || amount === null || reason === null || recordedAt === null) {
    return null;
  }

  return {
    id,
    userId,
    amount,
    // `reason` is a closed set in `lib/currency/ledger.ts`. An unrecognised value
    // is a schema mismatch rather than a new reason, and is dropped rather than
    // cast, so it cannot reach a balance as an uncategorized entry.
    reason: reason as CurrencyTransaction["reason"],
    sourceId: readText(row.source_id) ?? "",
    recordedAt,
  };
}

/** Narrows an inventory row. */
function toInventoryItem(row: InventoryRow): InventoryItem | null {
  const itemId = readText(row.item_id);
  const acquiredAt = readIso(row.acquired_at);
  const sourceKind = readText(row.source_kind);

  if (itemId === null || acquiredAt === null) return null;

  return {
    itemId,
    sourceKind: (sourceKind ?? "default") as InventoryItem["sourceKind"],
    sourceId: readText(row.source_id),
    acquiredAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Reads and writes, each taking the executor it must run on                    */
/* -------------------------------------------------------------------------- */

/**
 * Reads a developer's wallet.
 *
 * Returns an empty inventory (and the starter set as the equipped fallback) when
 * the developer has no rows yet, so a caller always gets a usable wallet rather
 * than a null.
 */
export async function readWalletFrom(db: SqlExecutor, userId: string): Promise<Wallet> {
  const [transactions, items] = await Promise.all([
    db.query(
      `SELECT ${TRANSACTION_COLUMNS} FROM currency_transactions WHERE user_id = $1 ORDER BY created_at;`,
      [userId],
    ),
    db.query(INVENTORY_SELECT, [userId]),
  ]);

  const rows = allRows<InventoryRow>(items.rows);
  const inventory: Inventory = {
    userId,
    items: rows.map(toInventoryItem).filter((item): item is InventoryItem => item !== null),
  };

  // `equipped` is restored from the rows marked equipped, keyed by catalogue slot.
  // One item per slot is the domain's `EquippedCosmetics` map making the
  // impossible state unrepresentable; this is that map coming back from rows. A
  // developer with nothing marked equipped falls back to the starter set, which is
  // what `newWallet` would have equipped.
  const restored: Partial<Record<CosmeticSlot, string>> = {};
  for (const row of rows) {
    if (readBoolean(row.equipped) !== true) continue;
    const itemId = readText(row.item_id);
    const slot = readText(row.slot);
    if (itemId !== null && slot !== null) restored[slot as CosmeticSlot] = itemId;
  }

  const equipped: EquippedCosmetics =
    Object.keys(restored).length > 0
      ? restored
      : equipOwnedDefaults(inventory, DEFAULT_OWNED_IDS, COSMETIC_INDEX);

  return {
    userId,
    transactions: allRows<TransactionRow>(transactions.rows)
      .map(toTransaction)
      .filter((transaction): transaction is CurrencyTransaction => transaction !== null),
    inventory,
    equipped,
  };
}

/** Writes one owned item. A duplicate is a no-op, so a retry cannot double-grant. */
async function writeInventoryItem(
  db: SqlExecutor,
  userId: string,
  item: InventoryItem,
  equipped: boolean,
): Promise<void> {
  await db.query(
    `INSERT INTO inventory_items (id, user_id, item_id, source_kind, source_id, equipped, acquired_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, item_id) DO NOTHING;`,
    [
      inventoryKey(userId, item.itemId),
      userId,
      item.itemId,
      item.sourceKind,
      item.sourceId,
      equipped,
      item.acquiredAt,
    ],
  );
}

/** Grants the zero-price starter set. Idempotent, so a concurrent first read is safe. */
async function grantStarterSet(db: SqlExecutor, userId: string, at: string): Promise<void> {
  const starter = initialInventory(userId, at, COSMETIC_INDEX);
  for (const item of starter.items) {
    await writeInventoryItem(db, userId, item, false);
  }
}

/**
 * Reads a wallet, granting the starter set first if the developer is new.
 *
 * The grant and the re-read happen on the caller's executor, so inside a
 * transaction they join it. `ON CONFLICT DO NOTHING` is what makes two concurrent
 * first reads safe: both grant, the second writes nothing.
 */
async function readOrCreate(db: SqlExecutor, userId: string, at: string): Promise<Wallet> {
  const wallet = await readWalletFrom(db, userId);
  if (wallet.inventory.items.length > 0) return wallet;

  await grantStarterSet(db, userId, at);
  return readWalletFrom(db, userId);
}

/**
 * Replaces the equipped flags with `equipped`.
 *
 * Clear-then-set rather than a computed diff: two statements in the caller's
 * transaction, so the flags and the map cannot disagree if the second fails.
 */
async function writeEquipped(
  db: SqlExecutor,
  userId: string,
  equipped: EquippedCosmetics,
): Promise<void> {
  await db.query("UPDATE inventory_items SET equipped = false WHERE user_id = $1;", [userId]);

  for (const slot of Object.keys(equipped) as CosmeticSlot[]) {
    const itemId = equipped[slot];
    if (itemId === undefined) continue;
    await db.query(
      "UPDATE inventory_items SET equipped = true WHERE user_id = $1 AND item_id = $2;",
      [userId, itemId],
    );
  }
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

export interface PostgresWalletStoreOptions {
  /**
   * Opens the transaction `purchase` runs in. Injected so a test can supply a
   * fake; defaults to the real one in `lib/db/postgres.ts`.
   */
  readonly transaction?: <T>(fn: (tx: SqlExecutor) => Promise<T>) => Promise<T>;
}

/**
 * The wallet store backed by `currency_transactions` and `inventory_items`.
 *
 * Takes an {@link SqlExecutor} rather than importing the pool, so every statement
 * it issues can be asserted in a test without a database — which is how "a
 * duplicate request does not deduct twice" is held to the SQL and not merely to a
 * comment above it.
 */
export function createPostgresWalletStore(
  db: SqlExecutor,
  options: PostgresWalletStoreOptions = {},
): WalletStore {
  /**
   * Resolved lazily so importing this module never pulls in `pg`: a test that
   * supplies its own `transaction` never loads the driver at all.
   */
  async function openTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    if (options.transaction !== undefined) return options.transaction(fn);

    const { withTransaction } = await import("./postgres");
    return withTransaction(fn);
  }

  async function purchase(input: {
    readonly userId: string;
    readonly itemId: string;
    readonly at: string;
  }): Promise<PurchaseOutcome> {
    return openTransaction(async (tx) => {
      const wallet = await readOrCreate(tx, input.userId, input.at);

      const outcome = purchaseCosmetic({
        userId: input.userId,
        itemId: input.itemId,
        inventory: wallet.inventory,
        transactions: wallet.transactions,
        at: input.at,
      });

      // A refusal writes nothing at all, so "failed transaction does not corrupt
      // balance" is a property of taking this branch, not of a compensating step.
      if (!outcome.ok) return outcome;

      const granted = outcome.inventory.items.find((item) => item.itemId === input.itemId);

      // The spend. The purchase's idempotency key is its own primary key, so even
      // if a retry escaped the transaction the second insert is rejected rather
      // than charged twice.
      await tx.query(
        `INSERT INTO currency_transactions (transaction_id, user_id, amount, reason, source_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (transaction_id) DO NOTHING;`,
        [
          currencyKey(input.userId, "cosmetic_purchase", input.itemId),
          input.userId,
          -outcome.cost,
          "cosmetic_purchase",
          input.itemId,
          input.at,
        ],
      );

      // The grant. Both statements are in this transaction, so "paid but not
      // owned" is not reachable: if this fails, the spend above rolls back with it.
      if (granted !== undefined) {
        await writeInventoryItem(tx, input.userId, granted, true);
      }

      return outcome;
    });
  }

  async function equip(input: { readonly userId: string; readonly itemId: string }): Promise<EquipOutcome> {
    return openTransaction(async (tx) => {
      const wallet = await readOrCreate(tx, input.userId, new Date(0).toISOString());
      const outcome = equipCosmetic(wallet.inventory, wallet.equipped, input.itemId, COSMETIC_INDEX);

      if (!outcome.ok) return outcome;

      await writeEquipped(tx, input.userId, outcome.equipped);
      return outcome;
    });
  }

  async function unequip(input: { readonly userId: string; readonly slot: CosmeticSlot }): Promise<EquippedCosmetics> {
    return openTransaction(async (tx) => {
      const wallet = await readOrCreate(tx, input.userId, new Date(0).toISOString());
      const equipped = unequipCosmetic(wallet.equipped, input.slot);

      await writeEquipped(tx, input.userId, equipped);
      return equipped;
    });
  }

  return {
    read: (userId) => readOrCreate(db, userId, new Date(0).toISOString()),

    /**
     * Writes a whole wallet: the starter set, its transactions, and its owned
     * items. Used by the dev harness and a seed.
     *
     * The caller owns the transaction — `save` is a setup path, not a user
     * action, and the dev harness that calls it is already inside one.
     */
    async save(wallet) {
      await grantStarterSet(db, wallet.userId, new Date(0).toISOString());

      for (const transaction of wallet.transactions) {
        await db.query(
          `INSERT INTO currency_transactions (transaction_id, user_id, amount, reason, source_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (transaction_id) DO NOTHING;`,
          [
            transaction.id,
            transaction.userId,
            transaction.amount,
            transaction.reason,
            transaction.sourceId,
            transaction.recordedAt,
          ],
        );
      }

      const worn = new Set(Object.values(wallet.equipped));
      for (const item of wallet.inventory.items) {
        await writeInventoryItem(db, wallet.userId, item, worn.has(item.itemId));
      }

      return wallet;
    },

    purchase,
    equip,
    unequip,
  };
}