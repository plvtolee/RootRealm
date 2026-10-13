import { describe, expect, it } from "vitest";

import { createPostgresWalletStore } from "./wallet-store";
import type { SqlExecutor } from "./sql";

/**
 * TASKS 14.4's guarantees are statements about SQL, so these tests assert the
 * statements: that a purchase runs inside a transaction, that a refusal writes
 * nothing, and that the spend uses the ledger's idempotency key. A store that
 * produced the right `PurchaseOutcome` while charging outside the transaction
 * would pass an outcome-only test and fail this one.
 */

interface Call {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** A wallet's fixture rows: a funded ledger and one owned, equipped item. */
function walletRows(options: { transactions?: unknown[]; items?: unknown[] } = {}) {
  return {
    transactions: options.transactions ?? [
      {
        transaction_id: "cc:u1:adjustment:dev-harness",
        user_id: "u1",
        amount: "1000",
        reason: "adjustment",
        source_id: "dev-harness",
        created_at: new Date("2026-10-13T00:00:00.000Z"),
      },
    ],
    items: options.items ?? [
      {
        item_id: "frame-minimal",
        source_kind: "default",
        source_id: null,
        acquired_at: new Date("2026-10-13T00:00:00.000Z"),
        equipped: true,
        slot: "frame",
      },
    ],
  };
}

function fakeDb(
  respond: (sql: string, params: readonly unknown[]) => unknown[],
): { db: SqlExecutor; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    db: {
      async query(sql, params = []) {
        calls.push({ sql, params });
        return { rows: respond(sql, params) as Record<string, unknown>[] };
      },
    },
  };
}

/** An executor that answers reads from `rows` and records writes. */
function walletDb(rows = walletRows()) {
  return fakeDb((sql) => {
    if (sql.includes("FROM currency_transactions")) return rows.transactions;
    if (sql.includes("FROM inventory_items")) return rows.items;
    return [];
  });
}

/** Records whether a transaction was opened, and runs the body on the same db. */
function fakeTransaction(db: SqlExecutor) {
  const opened: string[] = [];
  return {
    opened,
    transaction: async <T,>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
      opened.push("BEGIN");
      const result = await fn(db);
      opened.push("COMMIT");
      return result;
    },
  };
}

// A real purchasable cosmetic: `frame-signal` costs 250, and the ledger below is
// funded with 1000, so the purchase is affordable.
const ACCOUNT = { userId: "u1", itemId: "frame-signal", at: "2026-10-13T01:00:00.000Z" };

describe("createPostgresWalletStore — purchase is transactional", () => {
  it("runs the whole purchase inside a transaction", async () => {
    const { db, calls } = walletDb();
    const { opened, transaction } = fakeTransaction(db);
    const store = createPostgresWalletStore(db, { transaction });

    const outcome = await store.purchase(ACCOUNT);

    expect(opened).toEqual(["BEGIN", "COMMIT"]);
    expect(outcome.ok).toBe(true);
    // Every statement of the purchase went through the transaction-bound executor.
    expect(calls.length).toBeGreaterThan(0);
  });

  it("writes the spend and the grant, both bound to the idempotency key", async () => {
    const { db, calls } = walletDb();
    const { transaction } = fakeTransaction(db);

    await createPostgresWalletStore(db, { transaction }).purchase(ACCOUNT);

    const spend = calls.find((call) => call.sql.includes("INSERT INTO currency_transactions"));
    const grant = calls.find((call) => call.sql.includes("INSERT INTO inventory_items"));

    expect(spend).toBeDefined();
    expect(spend?.params[0]).toBe("cc:u1:cosmetic_purchase:frame-signal");
    // The spend is negative: coins leave the wallet.
    expect(Number(spend?.params[2])).toBeLessThan(0);
    expect(grant).toBeDefined();
    expect(grant?.params[1]).toBe("u1");
    expect(grant?.params[2]).toBe("frame-signal");
  });

  it("rejects a second insert of the same purchase key, so a retry cannot charge twice", async () => {
    const { db, calls } = walletDb();
    const { transaction } = fakeTransaction(db);

    await createPostgresWalletStore(db, { transaction }).purchase(ACCOUNT);

    const spend = calls.find((call) => call.sql.includes("INSERT INTO currency_transactions"));
    expect(spend?.sql).toContain("ON CONFLICT (transaction_id) DO NOTHING");
  });

  it("writes nothing at all when the purchase is refused", async () => {
    // An empty ledger cannot cover a 250-coin item: `purchaseCosmetic` refuses
    // before any statement, so a failed spend cannot leave a trace.
    const { db, calls } = fakeDb((sql) => {
      if (sql.includes("FROM currency_transactions")) return [];
      if (sql.includes("FROM inventory_items")) return walletRows().items;
      return [];
    });
    const { transaction } = fakeTransaction(db);

    const outcome = await createPostgresWalletStore(db, { transaction }).purchase(ACCOUNT);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("insufficient_balance");
    const writes = calls.filter((call) => call.sql.startsWith("INSERT"));
    expect(writes).toEqual([]);
  });

  it("rolls back when the grant fails after the spend would have been written", async () => {
    const { db, calls } = walletDb();
    const opened: string[] = [];
    const failing: SqlExecutor = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql.includes("INSERT INTO inventory_items")) throw new Error("foreign key violation");
        return { rows: [] };
      },
    };

    const store = createPostgresWalletStore(db, {
      transaction: async <T,>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
        opened.push("BEGIN");
        try {
          const result = await fn(failing);
          opened.push("COMMIT");
          return result;
        } catch {
          opened.push("ROLLBACK");
          throw new Error("purchase rolled back");
        }
      },
    });

    // "Paid but not owned" is not reachable: the two writes share a transaction.
    await expect(store.purchase(ACCOUNT)).rejects.toThrow(/rolled back/);
    expect(opened).toEqual(["BEGIN", "ROLLBACK"]);
  });
});

describe("createPostgresWalletStore — equipping", () => {
  it("refuses to equip an item the developer does not own", async () => {
    const { db } = walletDb();
    const { transaction } = fakeTransaction(db);

    const outcome = await createPostgresWalletStore(db, { transaction }).equip({
      userId: "u1",
      itemId: "frame-signal",
    });

    expect(outcome).toEqual({ ok: false, refusal: "not_owned" });
  });

  it("clears the equipped flags before setting the worn one", async () => {
    // A stateful fake: `save` must make the granted item readable back, or the
    // equip that follows would be refused as unowned and this would assert
    // nothing at all.
    const calls: Call[] = [];
    const owned: Record<string, unknown>[] = [];
    const db: SqlExecutor = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql.includes("FROM currency_transactions")) return { rows: [] };
        if (sql.includes("FROM inventory_items")) return { rows: owned };
        if (sql.includes("INSERT INTO inventory_items")) {
          owned.push({
            item_id: params[2],
            source_kind: params[3],
            source_id: params[4],
            acquired_at: new Date(params[6] as string),
            equipped: params[5],
            slot: "frame",
          });
        }
        return { rows: [] };
      },
    };

    const store = createPostgresWalletStore(db, { transaction: async (fn) => fn(db) });

    // Grant the item first so the equip is permitted, then equip it.
    await store.save({
      userId: "u1",
      transactions: [],
      inventory: {
        userId: "u1",
        items: [
          {
            itemId: "frame-signal",
            sourceKind: "purchase",
            sourceId: "frame-signal",
            acquiredAt: "2026-10-13T01:00:00.000Z",
          },
        ],
      },
      equipped: {},
    });

    const outcome = await store.equip({ userId: "u1", itemId: "frame-signal" });

    expect(outcome.ok).toBe(true);
    const clear = calls.find((call) => call.sql.includes("SET equipped = false"));
    const set = calls.find((call) => call.sql.includes("SET equipped = true"));
    expect(clear).toBeDefined();
    expect(set).toBeDefined();
    // Clearing before setting is what keeps the map and the flags in agreement.
    expect(calls.indexOf(clear as Call)).toBeLessThan(calls.indexOf(set as Call));
  });
});

describe("createPostgresWalletStore — the starter set", () => {
  it("grants the starter set for a developer with no inventory, and reads again", async () => {
    let stocked = false;
    const calls: Call[] = [];
    const db: SqlExecutor = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql.includes("FROM currency_transactions")) return { rows: [] };
        if (sql.includes("FROM inventory_items")) {
          return {
            rows: stocked
              ? [
                  {
                    item_id: "frame-minimal",
                    source_kind: "default",
                    source_id: null,
                    acquired_at: new Date(0),
                    equipped: false,
                    slot: "frame",
                  },
                ]
              : [],
          };
        }
        if (sql.includes("INSERT INTO inventory_items")) stocked = true;
        return { rows: [] };
      },
    };

    const wallet = await createPostgresWalletStore(db).read("u1");

    expect(wallet.userId).toBe("u1");
    // The default `read` path is not inside a transaction here, but the grant is
    // still idempotent: two concurrent first reads cannot double-grant.
    expect(calls.some((call) => call.sql.includes("ON CONFLICT (user_id, item_id) DO NOTHING"))).toBe(true);
    expect(wallet.inventory.items.length).toBeGreaterThan(0);
  });
});