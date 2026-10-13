/**
 * RootRealm — inspect what is actually in the database (development only).
 *
 * ```bash
 * npx tsx scripts/inspect-db.ts
 * ```
 *
 * A verification script rather than a claim. `db:migrate` printing "applied 4
 * migrations" is a statement about statements; this reads the tables back and
 * prints what is in them, which is the only thing that proves a migration to a
 * real database worked. Read-only — it issues no writes.
 */
import { createRequire } from "node:module";

import { allRows } from "../lib/db/sql.ts";
import { closePool, databaseUrl, executor } from "../lib/db/postgres.ts";
import { serviceLogger } from "../lib/ops/monitoring.ts";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env") as {
  loadEnvConfig: (dir: string, dev?: boolean) => void;
};
loadEnvConfig(process.cwd());

const logger = serviceLogger("database");

async function main(): Promise<number> {
  const url = databaseUrl();
  if (url === null) {
    process.stderr.write("DATABASE_URL is not set.\n");
    return 1;
  }

  const db = executor();
  if (db === null) {
    process.stderr.write("Could not open a connection.\n");
    return 1;
  }

  try {
    // 1. Which migrations the database believes it has run.
    const applied = await db.query("SELECT id, applied_at FROM schema_migrations ORDER BY id;");
    process.stdout.write("Migrations recorded:\n");
    for (const row of allRows<{ id: string }>(applied.rows)) {
      process.stdout.write(`  ${row.id}\n`);
    }

    // 2. Every table the model declared, with a live row count.
    const tables = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name;`,
    );
    const names = allRows<{ table_name: string }>(tables.rows).map((row) => row.table_name);

    process.stdout.write(`\nTables (${names.length}):\n`);
    for (const name of names) {
      // Identifiers cannot be parameterized, and `name` comes from
      // `information_schema` for this database rather than from input, so the
      // interpolation is of a known-safe set rather than of user data.
      const counted = await db.query(`SELECT count(*)::int AS n FROM ${name};`);
      const total = (counted.rows[0] ?? { n: 0 }).n;
      process.stdout.write(`  ${String(total).padStart(5)}  ${name}\n`);
    }

    // 3. The catalogue that a purchase depends on, read back.
    const items = await db.query(
      "SELECT id, slot, price_code_coins FROM cosmetic_items ORDER BY slot, id;",
    );
    process.stdout.write(`\ncosmetic_items (${items.rows.length}):\n`);
    for (const row of allRows<{ id: string; slot: string; price_code_coins: number | null }>(
      items.rows,
    )) {
      const price = row.price_code_coins === null ? "not purchasable" : String(row.price_code_coins);
      process.stdout.write(`  ${row.id.padEnd(18)} ${String(row.slot).padEnd(8)} ${price}\n`);
    }

    // 4. A null price is the case the schema fix was for; assert it survived.
    const nullPriced = allRows<{ id: string }>(
      (await db.query("SELECT id FROM cosmetic_items WHERE price_code_coins IS NULL;")).rows,
    );
    process.stdout.write(
      `\nNon-purchasable items (price IS NULL): ${nullPriced.map((r) => r.id).join(", ") || "(none)"}\n`,
    );

    logger.info("database.inspected", { tables: names.length });

    return 0;
  } catch (error) {
    logger.error("database.inspect_failed", {
      errorName: error instanceof Error ? error.name : "NonError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    process.stderr.write(`Inspect failed: ${(error as Error).message}\n`);
    return 1;
  } finally {
    await closePool();
  }
}

void main().then((code) => {
  process.exitCode = code;
});