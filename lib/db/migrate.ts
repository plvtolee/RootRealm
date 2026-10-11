/**
 * RootRealm — the migration runner (TASKS 10.1).
 *
 * ```text
 * schema model → pending migrations → applied, exactly once, in order
 * ```
 *
 * TASKS 10.1 asks to configure PostgreSQL. This repository deliberately carries
 * no database driver: adding one would tie the code to a vendor before the
 * deployment target is chosen, and the schema is the part that has to be right
 * first. Instead the runner works against an injected {@link Queryable} — the
 * one method `pg`, `postgres.js` and Supabase's client all already have — so the
 * same runner drives whichever driver is wired up later, and it is testable with
 * an in-memory fake.
 *
 * ## Why it records what it applied
 *
 * A migration runner that re-runs migrations is worse than none: `CREATE TABLE`
 * fails on the second boot and the deployment cannot start. `schema_migrations`
 * is the record of what ran, and it is checked before anything is applied, so
 * startup is idempotent.
 *
 * ## Why it stops at the first failure
 *
 * Migrations are ordered and cumulative. If `0002` fails, applying `0003` would
 * build on a table that may not exist, and the resulting half-state is harder to
 * recover from than a clean stop. The runner throws with the migration id, so the
 * operator knows exactly where it stopped.
 */

import { MIGRATIONS, renderMigration, type Migration } from "./schema";

/** The one method the runner needs. `pg`'s `Pool`, `postgres.js` and Supabase all satisfy it. */
export interface Queryable {
  query(sql: string): Promise<unknown>;
}

/** How the runner is configured. */
export interface MigrationOptions {
  readonly migrator: Queryable;
  /** Injectable for tests; defaults to the full model. */
  readonly migrations?: readonly Migration[];
  /** Called as each migration is applied. */
  readonly onApply?: (migration: Migration) => void;
}

/** The outcome of a run. */
export interface MigrationReport {
  /** Migration ids applied by this run. */
  readonly applied: readonly string[];
  /** Migration ids already present and skipped. */
  readonly skipped: readonly string[];
}

/** Matches the identifier `schema_migrations` uses in the applied list. */
const APPLIED_TABLE = "schema_migrations";

/**
 * The `CREATE TABLE` for the bookkeeping table itself.
 *
 * It lives in the runner rather than in the schema model on purpose: the model
 * describes the product's data, and this table exists only to make migrations
 * idempotent. Putting it in `MIGRATIONS` would make the first migration depend
 * on the table that records migrations.
 */
const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS ${APPLIED_TABLE} (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);`.trim();

/**
 * Applies every migration that has not been applied yet, in order.
 *
 * `schema_migrations` is created first, the applied set is read once, then each
 * pending migration is rendered and run in a single statement followed by its
 * bookkeeping insert. The whole run is not wrapped in one transaction because
 * `CREATE TABLE` in PostgreSQL is transactional but a partial run that recorded
 * what it did is recoverable, whereas a rollback that hides its progress is not.
 */
export async function runMigrations(options: MigrationOptions): Promise<MigrationReport> {
  const migrations = options.migrations ?? MIGRATIONS;

  await options.migrator.query(CREATE_MIGRATIONS_TABLE);

  const applied = await readApplied(options.migrator);
  const appliedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      skippedIds.push(migration.id);
      continue;
    }

    try {
      await options.migrator.query(renderMigration(migration));
      await options.migrator.query(
        `INSERT INTO ${APPLIED_TABLE} (id) VALUES (${quote(migration.id)});`,
      );
    } catch (error) {
      throw new Error(
        `Migration ${migration.id} (${migration.title}) failed: ${(error as Error).message}`,
        { cause: error },
      );
    }

    appliedIds.push(migration.id);
    options.onApply?.(migration);
  }

  return { applied: appliedIds, skipped: skippedIds };
}

/** Reads the ids already recorded. */
async function readApplied(migrator: Queryable): Promise<Set<string>> {
  const result = await migrator.query(`SELECT id FROM ${APPLIED_TABLE};`);

  // Drivers disagree on the shape (`{ rows }`, an array, a cursor). Accept the
  // documented `{ rows }` and an array, and treat anything else as "nothing
  // applied" rather than throwing: an empty table is the safe reading, and it
  // makes the first run work against a driver this code has not seen.
  const rows = extractRows(result);

  const ids = new Set<string>();
  for (const row of rows) {
    if (row !== null && typeof row === "object" && "id" in row) {
      const value = (row as { id: unknown }).id;
      if (typeof value === "string") ids.add(value);
    }
  }

  return ids;
}

function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result !== null && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

/**
 * Quotes a string as a SQL literal.
 *
 * Only migration ids reach this, and they are authored in this repository, but
 * the escaping is unconditional anyway: a quoting helper that is "safe because
 * of the caller" is the one that becomes unsafe when the caller changes.
 */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}