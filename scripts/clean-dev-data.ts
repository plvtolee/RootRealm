/**
 * RootRealm — remove development and end-to-end rows from the database.
 *
 * ```bash
 * npx tsx scripts/clean-dev-data.ts [--yes]
 * ```
 *
 * Before `playwright.config.ts` pinned `DATABASE_URL` to empty, an E2E run wrote
 * its wallet fixtures into whatever database the developer had configured. This
 * removes exactly those rows and nothing else.
 *
 * ## What it matches, and why that is narrow enough
 *
 * Rows belonging to an account whose login carries the `dev:` prefix — the marker
 * `POST /api/dev/session` writes — or whose id names a known test harness. A real
 * account claimed through OAuth has a genuine GitHub login and is never matched,
 * so this cannot delete a developer's own character. The pattern is in the delete
 * rather than in JavaScript so the database does the filtering in one statement,
 * and the count is printed before the delete so an unexpected number is visible.
 */
import { createRequire } from "node:module";

import { closePool, databaseUrl, executor } from "../lib/db/postgres.ts";
import { serviceLogger } from "../lib/ops/monitoring.ts";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env") as {
  loadEnvConfig: (dir: string, dev?: boolean) => void;
};
loadEnvConfig(process.cwd());

const logger = serviceLogger("database");

/**
 * Accounts this is allowed to delete. Every clause is a harness marker.
 *
 * `login = 'e2e-dev'` is the mock GitHub's only login (`e2e/mock-github.mjs`),
 * so no real claim can ever carry it — and it is the one marker that was
 * missing: the mock account reached a real database when a Playwright run reused
 * an already-running development server, which `reuseExistingServer` permits.
 */
const HARNESS_ACCOUNTS = `
  id LIKE 'verify-persistence-probe'
  OR id LIKE 'e2e-%'
  OR id = 'dev-user'
  OR login LIKE 'dev:%'
  OR login = 'e2e-dev'
`;

async function main(): Promise<number> {
  if (databaseUrl() === null) {
    process.stderr.write("DATABASE_URL is not set; nothing to clean.\n");
    return 1;
  }

  const db = executor();
  if (db === null) {
    process.stderr.write("Could not open a connection.\n");
    return 1;
  }

  try {
    const before = await db.query(
      `SELECT count(*)::int AS n FROM users WHERE ${HARNESS_ACCOUNTS};`,
    );
    const users = (before.rows[0] as { n: number } | undefined)?.n ?? 0;

    const tx = await db.query(
      `SELECT count(*)::int AS n FROM currency_transactions WHERE user_id IN (
         SELECT id FROM users WHERE ${HARNESS_ACCOUNTS});`,
    );
    const transactions = (tx.rows[0] as { n: number } | undefined)?.n ?? 0;

    process.stdout.write(`Harness accounts:     ${users}\n`);
    process.stdout.write(`Their coin ledger:    ${transactions}\n\n`);

    if (users === 0) {
      process.stdout.write("Nothing to clean.\n");
      return 0;
    }

    if (process.argv.includes("--yes") === false) {
      process.stdout.write(
        "Re-run with --yes to delete these rows. Only harness accounts are matched;\n" +
          "an account claimed through OAuth has a real GitHub login and is untouched.\n",
      );
      return 0;
    }

    // Child-first, so a foreign key never blocks the delete.
    await db.query(
      `DELETE FROM currency_transactions WHERE user_id IN (SELECT id FROM users WHERE ${HARNESS_ACCOUNTS});`,
    );
    await db.query(
      `DELETE FROM inventory_items WHERE user_id IN (SELECT id FROM users WHERE ${HARNESS_ACCOUNTS});`,
    );
    await db.query(`DELETE FROM users WHERE ${HARNESS_ACCOUNTS};`);

    const after = await db.query(
      `SELECT count(*)::int AS n FROM users WHERE ${HARNESS_ACCOUNTS};`,
    );
    const remaining = (after.rows[0] as { n: number } | undefined)?.n ?? 0;

    process.stdout.write(`Cleaned. ${remaining} harness account(s) remain.\n`);
    logger.warn("database.dev_data_cleaned", { users, transactions });

    return 0;
  } catch (error) {
    logger.error("database.clean_failed", {
      errorName: error instanceof Error ? error.name : "NonError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    process.stderr.write(`Clean failed: ${(error as Error).message}\n`);
    return 1;
  } finally {
    await closePool();
  }
}

void main().then((code) => {
  process.exitCode = code;
});