import { describe, expect, it } from "vitest";

import { runMigrations, type Queryable } from "./migrate";
import { MIGRATIONS, renderMigration } from "./schema";

/** A fake migrator that records calls and can be primed with an applied set. */
function fakeMigrator(alreadyApplied: readonly string[] = []) {
  const calls: string[] = [];
  let applied = [...alreadyApplied];

  const migrator: Queryable = {
    async query(sql: string) {
      calls.push(sql);

      if (sql.startsWith("SELECT id FROM")) {
        return { rows: applied.map((id) => ({ id })) };
      }

      const insert = /^INSERT INTO schema_migrations \(id\) VALUES \('(.+)'\);$/.exec(sql);
      if (insert !== null) {
        applied = [...applied, insert[1] as string];
      }

      return { rows: [] };
    },
  };

  return { migrator, calls, applied: () => applied };
}

describe("runMigrations (10.1)", () => {
  it("creates the bookkeeping table before reading it", async () => {
    const { migrator, calls } = fakeMigrator();
    await runMigrations({ migrator });

    expect(calls[0]).toContain("CREATE TABLE IF NOT EXISTS schema_migrations");
    expect(calls[1]).toContain("SELECT id FROM schema_migrations");
  });

  it("applies every migration, in order, when none are recorded", async () => {
    const { migrator, applied } = fakeMigrator();
    const report = await runMigrations({ migrator });

    expect(report.applied).toEqual(MIGRATIONS.map((migration) => migration.id));
    expect(report.skipped).toEqual([]);
    expect(applied()).toEqual(MIGRATIONS.map((migration) => migration.id));
  });

  it("skips migrations that are already applied", async () => {
    const { migrator, calls } = fakeMigrator(["0001_core"]);
    const report = await runMigrations({ migrator });

    expect(report.skipped).toEqual(["0001_core"]);
    expect(report.applied).toEqual(["0002_progression", "0003_cosmetics", "0004_seasonal"]);

    const rendered = calls.filter((sql) => sql.includes("CREATE TABLE users"));
    expect(rendered).toEqual([]);
  });

  it("is idempotent: a second run applies nothing", async () => {
    const { migrator } = fakeMigrator();
    await runMigrations({ migrator });
    const second = await runMigrations({ migrator });

    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(MIGRATIONS.map((migration) => migration.id));
  });

  it("runs each migration's SQL", async () => {
    const { migrator, calls } = fakeMigrator();
    await runMigrations({ migrator });

    for (const migration of MIGRATIONS) {
      expect(calls).toContain(renderMigration(migration));
    }
  });

  it("reports progress through onApply", async () => {
    const { migrator } = fakeMigrator();
    const seen: string[] = [];

    await runMigrations({ migrator, onApply: (migration) => seen.push(migration.id) });

    expect(seen).toEqual(MIGRATIONS.map((migration) => migration.id));
  });

  it("stops at the first failure and names the migration", async () => {
    const { migrator } = fakeMigrator();

    const failing: Queryable = {
      async query(sql) {
        if (sql.includes("CREATE TABLE quests")) {
          throw new Error("syntax error at or near \"quests\"");
        }
        return migrator.query(sql);
      },
    };

    await expect(runMigrations({ migrator: failing })).rejects.toThrow(/0002_progression/);
  });

  it("does not apply a later migration after an earlier one failed", async () => {
    const calls: string[] = [];

    const failing: Queryable = {
      async query(sql) {
        calls.push(sql);
        if (sql.includes("CREATE TABLE quests")) throw new Error("boom");
        if (sql.startsWith("SELECT id FROM")) return { rows: [] };
        return { rows: [] };
      },
    };

    await catchAsync(() => runMigrations({ migrator: failing }));

    expect(calls.some((sql) => sql.includes("CREATE TABLE cosmetic_items"))).toBe(false);
    expect(calls.some((sql) => sql.includes("CREATE TABLE seasons"))).toBe(false);
  });

  it("treats an unreadable applied set as empty rather than throwing", async () => {
    const migrator: Queryable = {
      async query(sql) {
        if (sql.startsWith("SELECT id FROM")) return { unexpected: true };
        return undefined;
      },
    };

    const report = await runMigrations({ migrator });
    expect(report.applied).toEqual(MIGRATIONS.map((migration) => migration.id));
  });

  it("accepts a driver that returns an array of rows directly", async () => {
    const applied: string[] = ["0001_core"];
    const migrator: Queryable = {
      async query(sql) {
        if (sql.startsWith("SELECT id FROM")) return applied.map((id) => ({ id }));
        return [];
      },
    };

    const report = await runMigrations({ migrator });
    expect(report.skipped).toEqual(["0001_core"]);
  });

  it("escapes an id containing a quote", async () => {
    const { migrator, calls } = fakeMigrator();

    await runMigrations({
      migrator,
      migrations: [{ id: "0000_o'brien", title: "Adversarial id", tables: [] }],
    });

    expect(calls.some((sql) => sql.includes("'0000_o''brien'"))).toBe(true);
  });

  it("does not swallow a bookkeeping failure", async () => {
    const migrator: Queryable = {
      async query(sql) {
        if (sql.startsWith("INSERT INTO")) throw new Error("disk full");
        if (sql.startsWith("SELECT id FROM")) return { rows: [] };
        return { rows: [] };
      },
    };

    await expect(runMigrations({ migrator })).rejects.toThrow(/0001_core/);
  });
});

/** Awaits a promise expected to reject, returning the error. */
async function catchAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return null;
}