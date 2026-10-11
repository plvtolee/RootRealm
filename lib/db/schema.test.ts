import { describe, expect, it } from "vitest";

import {
  ALL_TABLES,
  CORE_TABLES,
  MIGRATIONS,
  findTable,
  primaryKeyColumns,
  renderCreateTable,
  renderMigration,
  type Table,
} from "./schema";

describe("schema structure (10.2-10.5)", () => {
  it("has every table the tasks name", () => {
    const names = new Set(ALL_TABLES.map((table) => table.name));
    for (const expected of [
      "users",
      "github_accounts",
      "repositories",
      "developer_events",
      "scoring_versions",
      "xp_transactions",
      "characters",
      "attribute_progress",
      "skill_nodes",
      "skill_unlocks",
      "achievements",
      "achievement_unlocks",
      "quests",
      "quest_progress",
      "cosmetic_items",
      "inventory_items",
      "currency_transactions",
      "seasons",
      "rank_snapshots",
    ]) {
      expect(names, `missing table ${expected}`).toContain(expected);
    }
  });

  it("gives every table a single primary key", () => {
    for (const table of ALL_TABLES) {
      expect(primaryKeyColumns(table).length, `${table.name} has no primary key`).toBeGreaterThan(0);
    }
  });

  it("assigns every table to exactly one migration", () => {
    const inMigrations = MIGRATIONS.flatMap((migration) => migration.tables);
    expect(new Set(inMigrations).size).toBe(inMigrations.length);

    for (const table of ALL_TABLES) {
      expect(inMigrations, `${table.name} is in no migration`).toContain(table.name);
    }
    expect(inMigrations.length).toBe(ALL_TABLES.length);
  });

  it("gives every table a note explaining why it exists", () => {
    for (const table of ALL_TABLES) {
      expect(table.note.length, `${table.name} has no note`).toBeGreaterThan(20);
    }
  });
});

describe("foreign keys and constraints (10.6)", () => {
  /** Every reference must point at a real table and a real column. */
  it("resolves every foreign key against the schema", () => {
    for (const table of ALL_TABLES) {
      for (const column of table.columns) {
        if (column.references === undefined) continue;

        const target = findTable(column.references.table);
        expect(target, `${table.name}.${column.name} references unknown table ${column.references.table}`).not.toBeNull();

        const targetHasColumn = target?.columns.some((c) => c.name === column.references?.column);
        expect(targetHasColumn, `${table.name}.${column.name} references unknown column ${column.references.column}`).toBe(true);
      }
    }
  });

  /** A referenced column must be unique or the primary key, or the FK is invalid SQL. */
  it("only references unique columns", () => {
    for (const table of ALL_TABLES) {
      for (const column of table.columns) {
        if (column.references === undefined) continue;

        const target = findTable(column.references.table);
        if (target === null) continue;

        const referenced = target.columns.find((c) => c.name === column.references?.column);
        const isPrimary = primaryKeyColumns(target).includes(column.references.column);
        const isUnique = referenced?.unique === true;

        expect(
          isPrimary || isUnique,
          `${table.name}.${column.name} references a non-unique column ${column.references.table}.${column.references.column}`,
        ).toBe(true);
      }
    }
  });

  it("prevents a developer earning the same skill or achievement twice", () => {
    const skillUnlocks = findTable("skill_unlocks") as Table;
    const achievementUnlocks = findTable("achievement_unlocks") as Table;

    expect(skillUnlocks.unique).toContainEqual({ columns: ["user_id", "skill_id"] });
    expect(achievementUnlocks.unique).toContainEqual({ columns: ["user_id", "achievement_id"] });
  });

  it("scopes quest progress to a period, so a daily quest can reset", () => {
    const questProgress = findTable("quest_progress") as Table;
    expect(questProgress.unique).toContainEqual({ columns: ["user_id", "quest_id", "period_key"] });
  });

  it("keys XP transactions by the idempotency key, so a repeat sync cannot double-award", () => {
    const transactions = findTable("xp_transactions") as Table;
    expect(primaryKeyColumns(transactions)).toEqual(["id"]);

    const idColumn = transactions.columns.find((column) => column.name === "id");
    expect(idColumn?.check).toContain("xp:");
  });

  it("keeps the GitHub id unique on both the user and the account", () => {
    for (const table of ["users", "github_accounts"]) {
      const column = findTable(table)?.columns.find((c) => c.name === "github_id");
      expect(column?.unique, `${table}.github_id is not unique`).toBe(true);
      expect(column?.type).toBe("bigint");
    }
  });

  it("stores a token only as ciphertext, never plaintext", () => {
    const accounts = findTable("github_accounts") as Table;
    const names = accounts.columns.map((column) => column.name);

    expect(names).toContain("access_token_ciphertext");
    // A column that would hold the raw token is the mistake this guards.
    expect(names).not.toContain("access_token");
    expect(names).not.toContain("token");
  });

  it("never uses a zone-less timestamp", () => {
    for (const table of ALL_TABLES) {
      for (const column of table.columns) {
        expect(column.type, `${table.name}.${column.name} is not timestamptz`).not.toBe("timestamp");
      }
    }
  });

  it("cascades from a user so deleting an account removes its own data", () => {
    for (const table of ["characters", "xp_transactions", "attribute_progress", "skill_unlocks", "achievement_unlocks"]) {
      const fk = findTable(table)?.columns.find((column) => column.references?.table === "users");
      expect(fk?.references?.onDelete, `${table} does not cascade from users`).toBe("cascade");
    }
  });
});

describe("SQL rendering (10.1)", () => {
  it("renders a CREATE TABLE with the primary key and constraints", () => {
    const sql = renderCreateTable(findTable("skill_unlocks") as Table);

    expect(sql).toContain("CREATE TABLE skill_unlocks");
    expect(sql).toContain("PRIMARY KEY");
    expect(sql).toContain("CONSTRAINT skill_unlocks_user_id_skill_id_key UNIQUE (user_id, skill_id)");
    expect(sql).toContain("REFERENCES users (id)");
  });

  it("renders composite primary keys", () => {
    const sql = renderCreateTable(findTable("attribute_progress") as Table);
    expect(sql).toContain("PRIMARY KEY (user_id, attribute)");
  });

  it("is deterministic", () => {
    for (const migration of MIGRATIONS) {
      expect(renderMigration(migration)).toBe(renderMigration(migration));
    }
  });

  it("renders every table in its migration", () => {
    for (const migration of MIGRATIONS) {
      const sql = renderMigration(migration);
      for (const table of migration.tables) {
        expect(sql, `${migration.id} does not create ${table}`).toContain(`CREATE TABLE ${table}`);
      }
    }
  });

  it("covers the core tables in the first migration", () => {
    const sql = renderMigration(MIGRATIONS[0] as (typeof MIGRATIONS)[number]);
    for (const table of CORE_TABLES) {
      expect(sql).toContain(`CREATE TABLE ${table.name}`);
    }
  });
});