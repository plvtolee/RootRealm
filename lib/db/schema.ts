/**
 * RootRealm — the database schema (TASKS 10.1–10.6).
 *
 * ```text
 * declarative tables → rendered SQL migrations
 * ```
 *
 * TASKS 10 asks for PostgreSQL, a set of tables, and the constraints that hold
 * them together. There is no database provisioned in this environment, so the
 * schema is a *model* here and the SQL is rendered from it. That is not a
 * downgrade: a schema written only as `.sql` cannot be checked, whereas a model
 * can be asserted against — every foreign key points at a real column, every
 * uniqueness rule the domain depends on exists, and every table belongs to a
 * migration. `lib/db/schema.test.ts` does exactly that.
 *
 * ## Why the constraints are the interesting part
 *
 * The application already guarantees some of these in code: the unlock records
 * are keyed per (developer, skill) and the XP transaction id is an idempotency
 * key. A database is where those become *structural* rather than *remembered*.
 * Hence TASKS 10.6 is not a footnote — `UNIQUE (user_id, skill_id)` is what
 * makes a double unlock impossible even if the application forgets, and
 * `xp_transactions.id` being the primary key is the whole of DATA_CONTRACT §4
 * ("one event, one transaction") expressed where it cannot be bypassed.
 *
 * ## Naming
 *
 * Tables are plural snake_case; columns are singular snake_case. Timestamps are
 * `timestamptz` — never a bare `timestamp`, because a zone-less column is a bug
 * waiting for the first developer who travels. Identifiers that come from
 * another system keep that system's type: GitHub ids are `bigint`, because
 * GitHub has already exceeded 32 bits.
 */

/** A column's storage type. Deliberately small — a closed set, like the contract. */
export type ColumnType =
  | "text"
  | "integer"
  | "bigint"
  | "boolean"
  | "timestamptz"
  | "jsonb"
  | "numeric";

/** A foreign key target. */
export interface Reference {
  readonly table: string;
  readonly column: string;
  /** What happens to this row when the referenced row goes away. */
  readonly onDelete: "cascade" | "restrict" | "set null";
}

/** One column. */
export interface Column {
  readonly name: string;
  readonly type: ColumnType;
  readonly notNull?: boolean;
  readonly primaryKey?: boolean;
  readonly unique?: boolean;
  readonly references?: Reference;
  /** A raw SQL default expression, e.g. `now()`. */
  readonly default?: string;
  /** A raw SQL check expression, without the `CHECK` keyword. */
  readonly check?: string;
}

/** A composite uniqueness rule. */
export interface UniqueConstraint {
  readonly columns: readonly string[];
}

/** A composite primary key, for tables whose identity is more than one column. */
export interface CompositePrimaryKey {
  readonly columns: readonly string[];
}

/** One table. */
export interface Table {
  readonly name: string;
  readonly columns: readonly Column[];
  readonly unique?: readonly UniqueConstraint[];
  /** Set instead of a column-level `primaryKey` when identity is composite. */
  readonly primaryKey?: CompositePrimaryKey;
  readonly note: string;
}

/** A migration: an ordered group of tables. */
export interface Migration {
  readonly id: string;
  readonly title: string;
  /** Table names created by this migration, in order. */
  readonly tables: readonly string[];
}

const id = (name = "id"): Column => ({
  name,
  type: "text",
  notNull: true,
  primaryKey: true,
});

const createdAt: Column = {
  name: "created_at",
  type: "timestamptz",
  notNull: true,
  default: "now()",
};

/**
 * TASKS 10.2 — the core tables.
 *
 * The spine: a user, the GitHub account that proves them, the public work that
 * was observed, the version that scored it, the transactions that resulted, and
 * the character those transactions add up to.
 */
export const CORE_TABLES: readonly Table[] = [
  {
    name: "users",
    note: "A RootRealm developer. Created only through the verified OAuth path (TASKS 9.2).",
    columns: [
      id(),
      {
        name: "github_id",
        type: "bigint",
        notNull: true,
        unique: true,
        // The claim key (TASKS 9.3): stable across renames, unlike the login.
      },
      { name: "login", type: "text", notNull: true },
      { name: "display_name", type: "text" },
      { name: "avatar_url", type: "text" },
      { name: "verified", type: "boolean", notNull: true, default: "false" },
      createdAt,
    ],
  },
  {
    name: "github_accounts",
    note: "The credential a user authorized with. The token is never stored in plaintext.",
    columns: [
      id(),
      {
        name: "user_id",
        type: "text",
        notNull: true,
        unique: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      { name: "github_id", type: "bigint", notNull: true, unique: true },
      { name: "login", type: "text", notNull: true },
      {
        name: "access_token_ciphertext",
        type: "text",
        notNull: true,
        // Ciphertext, never the token. PERMISSIONS boundary 1 (TASKS 9.4) is
        // "credentials remain server-side"; this is where the at-rest half of
        // that lives. The column name says so on purpose.
      },
      // The granted scopes, space-delimited exactly as GitHub reports them.
      // Stored so the boundary check (TASKS 9.4) can be re-run against what was
      // actually granted, not only against what was requested.
      { name: "scopes", type: "text", notNull: true, default: "''" },
      { name: "token_fingerprint", type: "text", notNull: true },
      createdAt,
      { name: "updated_at", type: "timestamptz", notNull: true, default: "now()" },
    ],
  },
  {
    name: "repositories",
    note: "A repository observed during ingestion (TASKS 4.3). Keyed by GitHub's numeric id.",
    columns: [
      { ...id("repository_id"), type: "bigint" },
      { name: "full_name", type: "text", notNull: true },
      { name: "slug", type: "text", notNull: true, unique: true },
      { name: "owner_login", type: "text", notNull: true },
      { name: "name", type: "text", notNull: true },
      { name: "description", type: "text" },
      { name: "url", type: "text" },
      { name: "primary_language", type: "text" },
      { name: "is_fork", type: "boolean", notNull: true, default: "false" },
      { name: "is_archived", type: "boolean", notNull: true, default: "false" },
      { name: "stars", type: "integer" },
      { name: "pushed_at", type: "timestamptz" },
      { name: "source", type: "jsonb", notNull: true },
      { name: "observed_at", type: "timestamptz", notNull: true, default: "now()" },
    ],
  },
  {
    name: "developer_events",
    note: "A normalized event (TASKS 4.5). `id` is the deterministic `${kind}:${eventId}`.",
    columns: [
      id(),
      { name: "developer_login", type: "text", notNull: true },
      { name: "developer_id", type: "bigint" },
      {
        name: "repository_id",
        type: "bigint",
        references: { table: "repositories", column: "repository_id", onDelete: "set null" },
      },
      { name: "repository_full_name", type: "text" },
      { name: "kind", type: "text", notNull: true },
      { name: "occurred_at", type: "timestamptz" },
      { name: "visibility", type: "text", notNull: true },
      { name: "confidence", type: "text", notNull: true },
      { name: "relevance", type: "text", notNull: true },
      { name: "source_url", type: "text" },
      { name: "payload", type: "jsonb", notNull: true },
      { name: "observed_at", type: "timestamptz", notNull: true, default: "now()" },
    ],
  },
  {
    name: "scoring_versions",
    note: "A scoring version and its XP table. Rows are immutable; a rebalance is a new version.",
    columns: [
      id(),
      { name: "introduced_at", type: "timestamptz", notNull: true },
      { name: "notes", type: "text" },
      { name: "xp", type: "jsonb", notNull: true },
    ],
  },
  {
    name: "xp_transactions",
    note: "DATA_CONTRACT §4: one event, one transaction. The id is the idempotency key.",
    columns: [
      // The idempotency key IS the primary key, so a repeated sync cannot
      // double-award: the second insert violates uniqueness (TASKS 11.3).
      { ...id(), check: "id LIKE 'xp:%'" },
      {
        name: "user_id",
        type: "text",
        notNull: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      {
        name: "event_id",
        type: "text",
        notNull: true,
        references: { table: "developer_events", column: "id", onDelete: "cascade" },
      },
      { name: "developer_login", type: "text", notNull: true },
      { name: "xp", type: "integer", notNull: true },
      { name: "classification", type: "text", notNull: true },
      { name: "reason", type: "text", notNull: true },
      { name: "rule_id", type: "text", notNull: true },
      { name: "lines", type: "jsonb", notNull: true, default: "'[]'::jsonb" },
      {
        name: "scoring_version_id",
        type: "text",
        notNull: true,
        references: { table: "scoring_versions", column: "id", onDelete: "restrict" },
      },
      createdAt,
    ],
  },
  {
    name: "characters",
    note: "The denormalized total a profile reads. Derived from transactions, never hand-edited.",
    columns: [
      {
        name: "user_id",
        type: "text",
        notNull: true,
        primaryKey: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      { name: "total_xp", type: "integer", notNull: true, default: "0" },
      { name: "level", type: "integer", notNull: true, default: "1" },
      { name: "level_curve_id", type: "text", notNull: true, default: "'curve-v1'" },
      { name: "updated_at", type: "timestamptz", notNull: true, default: "now()" },
    ],
  },
];

/**
 * TASKS 10.3 — the progression tables.
 *
 * The catalogue tables (`skill_nodes`, `achievements`, `quests`) mirror the code
 * catalogues; the unlock/progress tables are the per-developer state, each keyed
 * so the same achievement or node cannot be earned twice.
 */
export const PROGRESSION_TABLES: readonly Table[] = [
  {
    name: "attribute_progress",
    note: "Units per attribute (DATA_CONTRACT §14). One row per user per attribute.",
    columns: [
      {
        name: "user_id",
        type: "text",
        notNull: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      { name: "attribute", type: "text", notNull: true },
      { name: "units", type: "integer", notNull: true, default: "0" },
      { name: "updated_at", type: "timestamptz", notNull: true, default: "now()" },
    ],
    // Identity is (user_id, attribute): one row per developer per attribute.
    primaryKey: { columns: ["user_id", "attribute"] },
  },
  {
    name: "skill_nodes",
    note: "The skill catalogue (TASKS 6.1). Presentation lives in code, never here (TASKS 6.6).",
    columns: [
      id(),
      { name: "category", type: "text", notNull: true },
      { name: "tier", type: "integer", notNull: true },
      { name: "title", type: "text", notNull: true },
      { name: "description", type: "text", notNull: true },
      { name: "prerequisites", type: "jsonb", notNull: true, default: "'[]'::jsonb" },
      { name: "evidence", type: "jsonb", notNull: true, default: "'[]'::jsonb" },
      { name: "xp_reward", type: "integer", notNull: true, default: "0" },
    ],
  },
  {
    name: "skill_unlocks",
    note: "One row per (developer, skill): TASKS 6.5's structural duplicate prevention.",
    columns: [
      id(),
      {
        name: "user_id",
        type: "text",
        notNull: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      {
        name: "skill_id",
        type: "text",
        notNull: true,
        references: { table: "skill_nodes", column: "id", onDelete: "restrict" },
      },
      { name: "evidence", type: "jsonb", notNull: true, default: "'[]'::jsonb" },
      { name: "unlocked_at", type: "timestamptz", notNull: true, default: "now()" },
    ],
    unique: [{ columns: ["user_id", "skill_id"] }],
  },
  {
    name: "achievements",
    note: "The achievement catalogue (TASKS 7.1). Rarity is display metadata, not a score.",
    columns: [
      id(),
      { name: "title", type: "text", notNull: true },
      { name: "description", type: "text", notNull: true },
      { name: "rarity", type: "text", notNull: true },
      { name: "criterion", type: "jsonb", notNull: true },
    ],
  },
  {
    name: "achievement_unlocks",
    note: "One row per (developer, achievement), holding the evidence ids (TASKS 7.3).",
    columns: [
      id(),
      {
        name: "user_id",
        type: "text",
        notNull: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      {
        name: "achievement_id",
        type: "text",
        notNull: true,
        references: { table: "achievements", column: "id", onDelete: "restrict" },
      },
      { name: "evidence_event_ids", type: "jsonb", notNull: true, default: "'[]'::jsonb" },
      { name: "unlocked_at", type: "timestamptz", notNull: true, default: "now()" },
    ],
    unique: [{ columns: ["user_id", "achievement_id"] }],
  },
  {
    name: "quests",
    note: "The quest catalogue (TASKS 12.1): daily, weekly and goal quests.",
    columns: [
      id(),
      { name: "kind", type: "text", notNull: true, check: "kind IN ('daily', 'weekly', 'goal')" },
      { name: "title", type: "text", notNull: true },
      { name: "description", type: "text", notNull: true },
      { name: "criterion", type: "jsonb", notNull: true },
      { name: "xp_reward", type: "integer", notNull: true, default: "0" },
      { name: "code_coin_reward", type: "integer", notNull: true, default: "0" },
    ],
  },
  {
    name: "quest_progress",
    note: "Per-developer quest state, scoped to a period so a daily quest resets honestly.",
    columns: [
      id(),
      {
        name: "user_id",
        type: "text",
        notNull: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      {
        name: "quest_id",
        type: "text",
        notNull: true,
        references: { table: "quests", column: "id", onDelete: "cascade" },
      },
      { name: "period_key", type: "text", notNull: true },
      { name: "progress", type: "integer", notNull: true, default: "0" },
      { name: "completed_at", type: "timestamptz" },
      { name: "updated_at", type: "timestamptz", notNull: true, default: "now()" },
    ],
    unique: [{ columns: ["user_id", "quest_id", "period_key"] }],
  },
];

/**
 * TASKS 10.4 — the cosmetic tables.
 *
 * The currency ledger is append-only and keyed by an idempotency key, exactly as
 * XP is: a repeated purchase must not spend twice.
 */
export const COSMETIC_TABLES: readonly Table[] = [
  {
    name: "cosmetic_items",
    note: "The cosmetic catalogue (TASKS 13.1). Purely presentational, priced in CodeCoins.",
    columns: [
      id(),
      { name: "slot", type: "text", notNull: true },
      { name: "name", type: "text", notNull: true },
      { name: "description", type: "text", notNull: true },
      { name: "rarity", type: "text", notNull: true },
      { name: "price_code_coins", type: "integer", notNull: true, check: "price_code_coins >= 0" },
    ],
  },
  {
    name: "inventory_items",
    note: "What a developer owns, and which piece is equipped per slot.",
    columns: [
      id(),
      {
        name: "user_id",
        type: "text",
        notNull: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      {
        name: "item_id",
        type: "text",
        notNull: true,
        references: { table: "cosmetic_items", column: "id", onDelete: "restrict" },
      },
      {
        // How the item was acquired, mirroring `CosmeticSourceKind` in
        // `lib/cosmetics/inventory.ts`. Stored rather than inferred, because the
        // inventory's stated job is to answer "how did I get this" (SCORING.md
        // A17 applies to rewards as much as to points) and inference from the
        // ledger cannot tell a quest grant from a default.
        name: "source_kind",
        type: "text",
        notNull: true,
        default: "'default'",
        check: "source_kind IN ('default', 'quest', 'purchase')",
      },
      /** The quest that granted it, or the item id for a purchase. */
      { name: "source_id", type: "text" },
      { name: "equipped", type: "boolean", notNull: true, default: "false" },
      { name: "acquired_at", type: "timestamptz", notNull: true, default: "now()" },
    ],
    unique: [{ columns: ["user_id", "item_id"] }],
  },
  {
    name: "currency_transactions",
    note: "The CodeCoin ledger. Append-only; the id is the idempotency key (TASKS 14.2).",
    columns: [
      { ...id("transaction_id"), check: "transaction_id LIKE 'cc:%'" },
      {
        name: "user_id",
        type: "text",
        notNull: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      { name: "amount", type: "integer", notNull: true },
      { name: "reason", type: "text", notNull: true },
      { name: "source_id", type: "text" },
      createdAt,
    ],
  },
];

/**
 * TASKS 10.5 — the seasonal tables.
 *
 * A rank snapshot is immutable and timestamped, because a ladder that can be
 * rewritten retroactively cannot be trusted as a record of a season.
 */
export const SEASONAL_TABLES: readonly Table[] = [
  {
    name: "seasons",
    note: "A season window and its published rules (PRD §13).",
    columns: [
      id(),
      { name: "name", type: "text", notNull: true },
      { name: "starts_at", type: "timestamptz", notNull: true },
      { name: "ends_at", type: "timestamptz", notNull: true },
      { name: "rules", type: "jsonb", notNull: true },
    ],
  },
  {
    name: "rank_snapshots",
    note: "A developer's standing in a season at a moment. Append-only, never updated.",
    columns: [
      id(),
      {
        name: "season_id",
        type: "text",
        notNull: true,
        references: { table: "seasons", column: "id", onDelete: "cascade" },
      },
      {
        name: "user_id",
        type: "text",
        notNull: true,
        references: { table: "users", column: "id", onDelete: "cascade" },
      },
      { name: "rank_points", type: "numeric", notNull: true },
      { name: "rank", type: "integer" },
      // A developer's standings are a time series, so two snapshots of the same
      // pair are allowed only when they were taken at different moments.
      { name: "computed_at", type: "timestamptz", notNull: true },
    ],
    unique: [{ columns: ["season_id", "user_id", "computed_at"] }],
  },
];

/** The whole schema, in dependency order. */
export const ALL_TABLES: readonly Table[] = [
  ...CORE_TABLES,
  ...PROGRESSION_TABLES,
  ...COSMETIC_TABLES,
  ...SEASONAL_TABLES,
];

/**
 * The migrations, in order.
 *
 * Each task's tables are one migration, so the file that a reviewer reads and
 * the task that specified it are the same unit.
 */
export const MIGRATIONS: readonly Migration[] = [
  { id: "0001_core", title: "Core tables (TASKS 10.2)", tables: CORE_TABLES.map((t) => t.name) },
  {
    id: "0002_progression",
    title: "Progression tables (TASKS 10.3)",
    tables: PROGRESSION_TABLES.map((t) => t.name),
  },
  {
    id: "0003_cosmetics",
    title: "Cosmetic tables (TASKS 10.4)",
    tables: COSMETIC_TABLES.map((t) => t.name),
  },
  {
    id: "0004_seasonal",
    title: "Seasonal tables (TASKS 10.5)",
    tables: SEASONAL_TABLES.map((t) => t.name),
  },
];

/** Renders one column definition. */
function renderColumn(column: Column): string {
  const parts = [`  ${column.name}`, column.type];

  // A named check first, then the key/nullability/default/reference clauses:
  // PostgreSQL accepts column constraints in any order, and this reads like the
  // schema does.
  if (column.check !== undefined) {
    parts.push(`CONSTRAINT ${column.name}_check CHECK (${column.check})`);
  }
  if (column.primaryKey) parts.push("PRIMARY KEY");
  if (column.notNull && !column.primaryKey) parts.push("NOT NULL");
  if (column.unique) parts.push("UNIQUE");
  if (column.default !== undefined) parts.push(`DEFAULT ${column.default}`);
  if (column.references !== undefined) {
    parts.push(`REFERENCES ${column.references.table} (${column.references.column})`);
    parts.push(`ON DELETE ${column.references.onDelete.toUpperCase()}`);
  }

  return parts.join(" ");
}

/** Renders one table as `CREATE TABLE`. Deterministic: same model, same SQL. */
export function renderCreateTable(table: Table): string {
  const lines = table.columns.map(renderColumn);

  for (const unique of table.unique ?? []) {
    const name = `${table.name}_${unique.columns.join("_")}_key`;
    lines.push(`  CONSTRAINT ${name} UNIQUE (${unique.columns.join(", ")})`);
  }

  if (table.primaryKey !== undefined) {
    lines.push(`  PRIMARY KEY (${table.primaryKey.columns.join(", ")})`);
  }

  return [
    `CREATE TABLE ${table.name} (`,
    lines.join(",\n"),
    ");",
  ].join("\n");
}

/** Renders a whole migration as one SQL script, tables in model order. */
export function renderMigration(migration: Migration): string {
  const byName = new Map(ALL_TABLES.map((table) => [table.name, table]));

  const body = migration.tables.map((name) => {
    const table = byName.get(name);
    if (table === undefined) {
      throw new Error(`Migration ${migration.id} names a table that does not exist: ${name}`);
    }
    return renderCreateTable(table);
  });

  return [
    `-- ${migration.id}: ${migration.title}`,
    "-- Generated from lib/db/schema.ts. Do not edit by hand.",
    "",
    body.join("\n\n"),
    "",
  ].join("\n");
}

/** The table a column belongs to, or null. */
export function findTable(name: string): Table | null {
  return ALL_TABLES.find((table) => table.name === name) ?? null;
}

/** Every `PRIMARY KEY` column of a table, whether column-level or composite. */
export function primaryKeyColumns(table: Table): readonly string[] {
  if (table.primaryKey !== undefined) return table.primaryKey.columns;
  return table.columns.filter((column) => column.primaryKey === true).map((column) => column.name);
}