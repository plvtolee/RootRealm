/**
 * RootRealm — the PostgreSQL connection (TASKS 10.1, for the Supabase target).
 *
 * ```text
 * DATABASE_URL → one pooled connection, shared by every route bundle
 * ```
 *
 * TASKS 10.1 chose the deployment target before the driver, and the interface
 * survived that decision: `runMigrations` and both stores are written against
 * {@link Queryable}, so this module is the only file that knows `pg` exists.
 *
 * ## Why the pool lives on `globalThis`
 *
 * The same reason `walletStore` does (`lib/currency/store.ts`): Next.js compiles
 * every route entry into its own bundle, so a module-scoped `Pool` would give the
 * shop route and the OAuth callback route a pool each. Ten connections per bundle
 * against Supabase's connection limit is a deployment that works on a laptop and
 * fails in production with "too many connections". `globalThis` is the one object
 * the bundles share, so there is exactly one pool per process.
 *
 * ## Why there is no driver-less mode here
 *
 * `DATABASE_URL` unset is a legitimate state — that is what the unit tests and the
 * in-memory stores use — so this module returns `null` rather than throwing, and
 * the choice of store happens above it (`lib/db/stores.ts`). Throwing here would
 * make the database the reason every test fails instead of the reason one
 * deployment is misconfigured.
 *
 * ## TLS
 *
 * SSL is not configured in code. Supabase's connection strings carry an `sslmode`
 * query parameter and `pg` parses it (`pg-connection-string`), so
 * `?sslmode=verify-full` in `DATABASE_URL` is what turns on certificate
 * verification. Adding an `ssl` option here would silently override that, which
 * is how a deployment ends up thinking it verifies the server when it does not.
 */
import { Pool, type PoolClient, type QueryResultRow } from "pg";

import type { Queryable } from "./migrate";
import type { SqlExecutor, SqlRow } from "./sql";

/**
 * The connection string, or null when no database is configured.
 *
 * A trimmed, non-empty value or nothing: a blank `DATABASE_URL=` is the most
 * common misconfiguration (it is what `.env.example` ships with) and treating it
 * as a connection string produces a confusing parse error rather than "no
 * database configured".
 */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.DATABASE_URL?.trim();
  return value !== undefined && value.length > 0 ? value : null;
}

/** Whether a database is configured in this process. */
export function hasDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  return databaseUrl(env) !== null;
}

const GLOBAL_KEY = "__rootrealm_pg_pool__";

type GlobalWithPool = typeof globalThis & { [GLOBAL_KEY]?: Pool };

/**
 * The process-wide pool, or null when `DATABASE_URL` is unset.
 *
 * Created on first use rather than at module load, so importing a route in a
 * build (where no database exists) does not open a connection.
 */
export function pool(): Pool | null {
  const url = databaseUrl();
  if (url === null) return null;

  const scope = globalThis as GlobalWithPool;

  // `max: 4` is deliberate. Supabase's connection pooler (Supavisor) is the
  // shared bottleneck, and a long-lived Node server holding more idle
  // connections than it needs is the fastest way to exhaust it. Four is ample
  // for this app: no route holds a connection across an await on the network.
  scope[GLOBAL_KEY] ??= new Pool({
    connectionString: url,
    max: 4,
    // A server that cannot reach the database should say so quickly rather than
    // hanging a request until the platform's own timeout kills it.
    connectionTimeoutMillis: 10_000,
  });

  return scope[GLOBAL_KEY] as Pool;
}

/**
 * The pool as a {@link Queryable}, or null when no database is configured.
 *
 * The migration runner takes this. `Pool.query(text)` satisfies the single-method
 * interface by construction, which is the point of the interface.
 */
export function migrator(): Queryable | null {
  const connection = pool();
  if (connection === null) return null;

  return {
    query: (sql: string) => connection.query(sql),
  };
}

/** The database is reachable. Used by the deployment checks and `/dev/github`. */
export async function isReachable(): Promise<boolean> {
  const connection = pool();
  if (connection === null) return false;

  try {
    await connection.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs `fn` inside a transaction, committing on success and rolling back on any
 * failure.
 *
 * This is where TASKS 14.4's atomicity actually lives. `purchaseCosmetic` is
 * pure and decides in one step, but "decide" and "write" are two separate
 * statements, and between them another request can decide it is allowed to spend
 * the same balance. Wrapping the read-decide-write sequence in one transaction is
 * what makes the guarantee structural rather than a convention — the same reason
 * the in-memory store has no `await` between its read and its write.
 *
 * The callback receives a {@link SqlExecutor} bound to the **same client**, so
 * every parameterized query it runs is inside the transaction. Handing back the
 * pool instead would be worse than not having a transaction at all: each
 * `pool.query` may use a different connection, so the statements would run
 * outside the `BEGIN` while appearing to be inside it — atomic in name, racy in
 * fact. That is why this accepts a callback rather than returning a client.
 */
export async function withTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  const connection = pool();
  if (connection === null) {
    throw new Error("withTransaction called with no DATABASE_URL configured.");
  }

  const client: PoolClient = await connection.connect();

  const tx: SqlExecutor = {
    query: (sql, params = []) =>
      client.query(sql, params as unknown[]) as Promise<{ rows: SqlRow[] }>,
  };

  try {
    await client.query("BEGIN");
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // A rollback that itself fails must not mask the error that caused it.
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** The pool as a {@link SqlExecutor}, for parameterized queries outside a transaction. */
export function executor(): SqlExecutor | null {
  const connection = pool();
  if (connection === null) return null;

  return {
    query: (sql, params = []) =>
      connection.query(sql, params as unknown[]) as Promise<{ rows: SqlRow[] }>,
  };
}

/** The raw client for a parameterized query, for callers building their own SQL. */
export function database(): Pool | null {
  return pool();
}

/** One row out of a parameterized query. */
export async function oneRow<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[],
): Promise<T | null> {
  const connection = pool();
  if (connection === null) return null;

  const result = await connection.query<T>(sql, params as unknown[]);
  return result.rows[0] ?? null;
}

/** Every row out of a parameterized query. */
export async function manyRows<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[],
): Promise<T[]> {
  const connection = pool();
  if (connection === null) return [];

  const result = await connection.query<T>(sql, params as unknown[]);
  return result.rows;
}

/** Closes the pool. For scripts and tests that open one. */
export async function closePool(): Promise<void> {
  const scope = globalThis as GlobalWithPool;
  const existing = scope[GLOBAL_KEY];
  if (existing === undefined) return;

  delete scope[GLOBAL_KEY];
  await existing.end();
}