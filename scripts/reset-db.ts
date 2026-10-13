/**
 * RootRealm — drop and recreate the schema (development only).
 *
 * ```bash
 * npm run db:reset
 * ```
 *
 * ## What this is for, and what it is not
 *
 * Migrations are forward-only by design (`lib/db/migrate.ts` refuses to re-apply
 * one it has recorded), which is what makes a deploy safe and what makes a
 * *changed* migration awkward: editing `0003_cosmetics.sql` has no effect on a
 * database that already ran it. That is correct behaviour, not a bug — production
 * history must never be rewritten — but during development it means a model fix
 * needs a clean database to apply to.
 *
 * This is that clean database. It drops the public schema and lets
 * `runMigrations` rebuild it from `lib/db/schema.ts`.
 *
 * ## The guards, and why they are here
 *
 * This **destroys every account, wallet, balance and purchase**. It refuses to run
 * when `NODE_ENV === "production"` and refuses to run without a `DATABASE_URL` to
 * destroy, and it prints the host it is about to drop so a wrong variable is
 * visible before the drop rather than after. A destructive command whose blast
 * radius is only visible in the diff of what it deletes is a destructive command
 * people run on the wrong database.
 */
import { createRequire } from "node:module";

import { closePool, databaseUrl, migrator } from "../lib/db/postgres.ts";
import { runMigrations } from "../lib/db/migrate.ts";
import { MIGRATIONS } from "../lib/db/schema.ts";
import { seedCatalogues } from "../lib/db/seed.ts";
import { serviceLogger } from "../lib/ops/monitoring.ts";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env") as {
  loadEnvConfig: (dir: string, dev?: boolean) => void;
};
loadEnvConfig(process.cwd());

const logger = serviceLogger("database");

/** The host and database, never the password. */
function safeTarget(connection: string): string {
  try {
    const parsed = new URL(connection);
    return `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable)";
  }
}

async function main(): Promise<number> {
  // Refuse before anything is dropped.
  if (process.env.NODE_ENV === "production") {
    process.stderr.write(
      "db:reset refuses to run when NODE_ENV=production. This drops every account,\n" +
        "wallet, balance and purchase in the target database.\n",
    );
    return 1;
  }

  const url = databaseUrl();

  if (url === null) {
    process.stderr.write(
      "DATABASE_URL is not set, so there is nothing to reset. Set it and re-run.\n",
    );
    return 1;
  }

  const target = safeTarget(url);

  process.stdout.write(
    `\nAbout to DROP the public schema on ${target}.\n` +
      "Every account, wallet, coin balance and purchase in it will be deleted.\n" +
      "The schema is then rebuilt from lib/db/schema.ts.\n\n",
  );

  const db = migrator();
  if (db === null) {
    process.stderr.write("Could not open a connection to drop the schema.\n");
    return 1;
  }

  try {
    logger.warn("database.reset_started", { target });

    // `CASCADE` because the migrations' foreign keys reference each other, and
    // `RESTRICT` would refuse to drop `users` while `xp_transactions` points at it.
    await db.query("DROP SCHEMA public CASCADE;");
    await db.query("CREATE SCHEMA public;");

    logger.warn("database.reset_dropped", { target });

    const report = await runMigrations({ migrator: db });
    process.stdout.write(
      `Rebuilt: applied ${report.applied.length} migration(s).\n`,
    );

    const { executor } = await import("../lib/db/postgres.ts");
    const dbExecutor = executor();

    if (dbExecutor === null) {
      throw new Error("No executor available for seeding.");
    }

    const seedReport = await seedCatalogues(dbExecutor);
    process.stdout.write(
      `Seeded ${seedReport.total} catalogue row(s): ` +
        Object.entries(seedReport.inserted)
          .map(([table, count]) => `${table}=${count}`)
          .join(", ") +
        ".\n",
    );

    logger.info("database.reset_complete", {
      target,
      migrations: MIGRATIONS.length,
      rows: seedReport.total,
    });

    return 0;
  } catch (error) {
    logger.error("database.reset_failed", {
      errorName: error instanceof Error ? error.name : "NonError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    process.stderr.write(`Reset failed: ${(error as Error).message}\n`);
    return 1;
  } finally {
    await closePool();
  }
}

void main().then((code) => {
  process.exitCode = code;
});