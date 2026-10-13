/**
 * RootRealm — verify persistence against the configured database.
 *
 * ```bash
 * npx tsx scripts/verify-persistence.ts
 * ```
 *
 * The claim "the database works" has two very different meanings, and only one of
 * them is usually tested:
 *
 * 1. the schema applies and the catalogues seed — proven by `db:migrate`;
 * 2. a **write survives a restart**, which is the property the whole store
 *    exists for.
 *
 * This proves (2). It writes an account and a funded wallet through the real
 * stores, re-reads them from a *fresh pool*, and prints the counts before and
 * after. A run that reports `users 1 -> 1` and a wallet whose balance is intact
 * has demonstrated persistence end to end; one that reports `users 1 -> 0` has
 * demonstrated that the in-memory fallback is still in force.
 *
 * It uses a distinctive user id so it is obvious what it created, and it cleans
 * up after itself so a repeated run does not accumulate rows.
 */
import { createRequire } from "node:module";

import { accountStore, resetStores, storageBackend, walletStore } from "../lib/db/stores.ts";
import { closePool, databaseUrl, executor } from "../lib/db/postgres.ts";
import { serviceLogger } from "../lib/ops/monitoring.ts";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env") as {
  loadEnvConfig: (dir: string, dev?: boolean) => void;
};
loadEnvConfig(process.cwd());

const logger = serviceLogger("database");

/** A distinctive id, so what this script writes is obvious in the table. */
const USER_ID = "verify-persistence-probe";

/** Counts the probe rows directly, rather than through the stores. */
async function countOf(sql: string): Promise<number> {
  const db = executor();
  if (db === null) return 0;

  const { rows } = await db.query(sql, [USER_ID]);
  return (rows[0] as { n?: number } | undefined)?.n ?? 0;
}

const countUsers = (): Promise<number> =>
  countOf("SELECT count(*)::int AS n FROM users WHERE id = $1;");

const countBalance = (): Promise<number> =>
  countOf("SELECT coalesce(sum(amount), 0)::int AS n FROM currency_transactions WHERE user_id = $1;");

async function cleanup(): Promise<void> {
  const db = executor();
  if (db === null) return;

  // Ordered child-first so the foreign keys never block the delete.
  await db.query("DELETE FROM currency_transactions WHERE user_id = $1;", [USER_ID]);
  await db.query("DELETE FROM inventory_items WHERE user_id = $1;", [USER_ID]);
  await db.query("DELETE FROM users WHERE id = $1;", [USER_ID]);
}

async function main(): Promise<number> {
  if (databaseUrl() === null) {
    process.stderr.write(
      "DATABASE_URL is not set, so there is nothing to verify. Set it and re-run.\n",
    );
    return 1;
  }

  process.stdout.write(`Backend in use: ${storageBackend()}\n\n`);

  if (storageBackend() !== "postgres") {
    process.stderr.write(
      "The in-memory store is in force, which means nothing can persist.\n" +
        "Set DATABASE_URL and restart this process.\n",
    );
    return 1;
  }

  try {
    await cleanup();

    // --- Write, through the same code paths the routes use. ---------------
    await accountStore().save({
      id: USER_ID,
      login: "persistence-probe",
      githubId: -999_001,
      displayName: "Persistence probe",
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      verified: false,
    });

    const wallet = walletStore();
    await wallet.save({
      userId: USER_ID,
      transactions: [
        {
          id: `cc:${USER_ID}:adjustment:probe`,
          userId: USER_ID,
          amount: 777,
          reason: "adjustment",
          sourceId: "probe",
          recordedAt: new Date().toISOString(),
        },
      ],
      inventory: { userId: USER_ID, items: [] },
      equipped: {},
    });

    process.stdout.write("Wrote one account and a 777-coin wallet.\n");
    process.stdout.write(`  users:            ${await countUsers()}\n`);
    process.stdout.write(`  balance:          ${await countBalance()}\n`);

    // --- Read back, through a fresh pool, as a restart would. --------------
    // The stores cache the executor they were built over, so both are cleared:
    // ending the pool without clearing them would fail on the dead executor
    // rather than on anything about persistence (see `resetStores`).
    resetStores();
    await closePool();

    const account = await accountStore().findById(USER_ID);
    const readWallet = await walletStore().read(USER_ID);

    process.stdout.write("\nAfter closing the pool and re-reading (a restart's effect):\n");
    process.stdout.write(`  account found:    ${account === null ? "NO — not persisted" : "yes"}\n`);
    if (account !== null) {
      process.stdout.write(`  login:            ${account.login}\n`);
    }

    const balance = readWallet.transactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    );
    process.stdout.write(`  balance:          ${balance}\n`);
    process.stdout.write(`  starter items:    ${readWallet.inventory.items.length}\n`);

    const persisted = account !== null && balance === 777;

    await cleanup();
    process.stdout.write("\nCleaned up the probe rows.\n");

    logger.info("database.persistence_verified", { persisted });

    if (!persisted) {
      process.stderr.write(
        "\nNOT PERSISTED. The write was visible only through the same process.\n",
      );
      return 1;
    }

    process.stdout.write("\nPersistence verified: the data outlived the connection.\n");
    return 0;
  } catch (error) {
    logger.error("database.persistence_check_failed", {
      errorName: error instanceof Error ? error.name : "NonError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    process.stderr.write(`Verification failed: ${(error as Error).message}\n`);
    return 1;
  } finally {
    await closePool();
  }
}

void main().then((code) => {
  process.exitCode = code;
});