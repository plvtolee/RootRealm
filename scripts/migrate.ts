/**
 * RootRealm — the database bootstrap script (TASKS 10.1, 10.7).
 *
 * ```bash
 * npm run db:migrate            # apply migrations and seed the catalogues
 * ```
 *
 * Reads `DATABASE_URL` through Next's own `.env*` loader, so a local
 * `.env.local` behaves exactly as it does for the server and no one has to export
 * a variable by hand.
 *
 * ## Why seeding is required, not optional polish
 *
 * `inventory_items.item_id` references `cosmetic_items.id`. A purchase therefore
 * cannot write a grant until the catalogue exists, so a migrated-but-unseeded
 * database is a database where the shop fails on first use. Seeding runs by
 * default and is idempotent — every insert is `ON CONFLICT DO NOTHING` — so a
 * deploy can call this script unconditionally and re-running changes nothing.
 *
 * ## Why it is a script and not a boot step
 *
 * Applying DDL at server start means several instances racing to create the same
 * table, and it buries a migration failure inside a request. Migrations are an
 * explicit, ordered deploy step, so they live here.
 *
 * ## Why the whole body is in `main()`
 *
 * This runs under `tsx`, which treats a `.ts` file without `"type": "module"` in
 * `package.json` as CommonJS — where top-level `await` is a syntax error. An
 * async entry point is the fix that does not change how the project's other
 * modules are written. `tsx` is also what resolves the extensionless relative
 * imports the application uses (Next and Vitest both do; bare Node would not).
 */
import { createRequire } from "node:module";

import { runMigrations } from "../lib/db/migrate.ts";
import { MIGRATIONS } from "../lib/db/schema.ts";
import { closePool, databaseUrl, executor, migrator } from "../lib/db/postgres.ts";
import { seedCatalogues } from "../lib/db/seed.ts";
import { serviceLogger } from "../lib/ops/monitoring.ts";

// `@next/env` is CommonJS and has no default export, so it is loaded through
// `createRequire` rather than an import. Loading `.env*` the way Next does is the
// point: a local `.env.local` then behaves exactly as it does for the server.
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env") as {
  loadEnvConfig: (dir: string, dev?: boolean) => void;
};

loadEnvConfig(process.cwd());

const logger = serviceLogger("database");

/**
 * The host and database, never the password.
 *
 * A migration log ends up in CI output, and a connection string carries the
 * password in it. Logging the target alone keeps the log safe to paste.
 */
function safeTarget(connection: string): string {
  try {
    const parsed = new URL(connection);
    const port = parsed.port === "" ? "" : `:${parsed.port}`;
    return `${parsed.hostname}${port}/${parsed.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable)";
  }
}

async function main(): Promise<number> {
  const url = databaseUrl();

  if (url === null) {
    process.stderr.write(
      "DATABASE_URL is not set. Copy .env.example to .env.local, paste your Supabase\n" +
        "connection string there, then run this again.\n",
    );
    return 1;
  }

  logger.info("database.migrate_started", {
    target: safeTarget(url),
    migrations: MIGRATIONS.length,
  });

  try {
    const db = migrator();
    if (db === null) {
      throw new Error("No migrator available despite DATABASE_URL being set.");
    }

    const report = await runMigrations({ migrator: db });

    logger.info("database.migrated", {
      applied: report.applied.length,
      skipped: report.skipped.length,
      appliedIds: report.applied,
    });

    process.stdout.write(
      `Applied ${report.applied.length} migration(s), skipped ${report.skipped.length}.\n`,
    );

    const dbExecutor = executor();
    if (dbExecutor === null) {
      throw new Error("No executor available for seeding.");
    }

    const seedReport = await seedCatalogues(dbExecutor);

    logger.info("database.seeded", { rows: seedReport.total });
    process.stdout.write(
      `Seeded ${seedReport.total} catalogue row(s): ` +
        Object.entries(seedReport.inserted)
          .map(([table, count]) => `${table}=${count}`)
          .join(", ") +
        ".\n",
    );

    return 0;
  } catch (error) {
    logger.error("database.migrate_failed", {
      errorName: error instanceof Error ? error.name : "NonError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    process.stderr.write(`Migration failed: ${(error as Error).message}\n`);
    return 1;
  } finally {
    await closePool();
  }
}

// No top-level `await`: `tsx` compiles this file to CommonJS (the package has no
// `"type": "module"`), where top-level await is a syntax error. `process.exitCode`
// rather than `process.exit` for the same reason `generate-migrations.ts` just
// awaits — exiting immediately can truncate a pending stdout write, which for a
// deploy script means a report that silently loses its last line.
void main().then((code) => {
  process.exitCode = code;
});