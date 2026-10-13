/**
 * RootRealm — the parameterized-query seam for the SQL stores.
 *
 * ```text
 * a store → a query with parameters → rows
 * ```
 *
 * `lib/db/postgres.ts` owns the driver. This file owns the one thing a store
 * needs, so a store can be tested against a fake that records SQL without any
 * database existing — the same reason `Queryable` exists for the migration
 * runner.
 *
 * ## Why parameters, always
 *
 * Every value reaching SQL in this project is a placeholder (`$1`) and never
 * string concatenation. TASKS 19.2 validates inputs at the edge because the
 * values reach GitHub; these values reach Postgres, where a login containing a
 * quote is either a syntax error or, worse, injected SQL. Parameter binding is
 * the only thing that makes both impossible, so there is no concatenating helper
 * to reach for.
 *
 * ## Why the row shapes are asserted rather than trusted
 *
 * `pg` returns `bigint` as a **string** (JavaScript cannot hold a 64-bit integer
 * exactly, so losing precision is the safe failure) and `timestamptz` as a
 * `Date`. A store that reads `row.github_id` as a number gets a string and a
 * silent `NaN` comparison; one that reads `created_at` as a string gets an ISO
 * string from the driver and a `Date` from a fixture, and two different things
 * depending on where the value came from. {@link readText}, {@link readNumber}
 * and {@link readIso} narrow once, at the boundary, so the domain types are what
 * the rest of the code sees.
 */

/**
 * A database handle that runs a parameterized query.
 *
 * `query` returns `any[]` rather than a generic `T[]` on purpose. A generic
 * signature reads better but makes every implementation a cast: a fake written in
 * a test returns concrete row shapes that TypeScript cannot prove satisfy an
 * unconstrained `T`, and the result is `as never[]` scattered through the suite.
 * Typing the rows as `SqlRow` instead keeps the *inputs* checked (the SQL and the
 * parameters are still typed) and the *outputs* narrowed once, at `firstRow` and
 * `allRows`, which is the boundary where the driver actually loses type
 * information.
 */
export interface SqlExecutor {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ readonly rows: SqlRow[]; readonly rowCount?: number | null }>;
}

/** One raw row. */
export type SqlRow = Record<string, unknown>;

/** The first row, or null. */
export function firstRow<T>(rows: readonly unknown[]): T | null {
  return rows.length > 0 ? (rows[0] as T) : null;
}

/** Every row. */
export function allRows<T>(rows: readonly unknown[]): T[] {
  return rows as T[];
}

/** A text column, or null. `null` for SQL NULL and for a non-string value. */
export function readText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * A numeric column as a JS number.
 *
 * Accepts the string a `bigint` arrives as, because GitHub ids are `bigint` in
 * the schema and this is where that becomes a number the domain can compare.
 */
export function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A boolean column. */
export function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * A `timestamptz` column as an ISO-8601 string.
 *
 * `pg` returns a `Date`; the domain speaks ISO-8601 everywhere (the rest of the
 * project agrees, and `Account.createdAt` is typed as a string). A string is
 * passed through so a fixture can supply one, and an unparseable value becomes
 * null rather than the string `"Invalid Date"`.
 */
export function readIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

/**
 * A `jsonb` column.
 *
 * Passed through unchanged: the domain modules that read JSON columns already
 * validate the shape they expect, and re-parsing here would mean two definitions
 * of what a valid one is.
 */
export function readJson(value: unknown): unknown {
  return value;
}

/** The `sql` string for an `IN` list, for a fixed, code-owned set of placeholders. */
export function placeholders(count: number): string {
  if (count <= 0) return "NULL";
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(", ");
}