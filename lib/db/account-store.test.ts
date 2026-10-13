import { describe, expect, it } from "vitest";

import { createPostgresAccountStore } from "./account-store";
import { allRows, firstRow, readBoolean, readIso, readNumber, readText, type SqlExecutor } from "./sql";

/**
 * TASKS 10.1: the account store is only as good as the SQL it issues, so these
 * tests assert the *statement*, not just the returned object — a store that
 * returned the right account while writing an unbounded UPDATE would still be a
 * bug, and only the statement would say so.
 */

/** One recorded query. */
interface Call {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * A fake executor that records every statement and answers from `respond`.
 *
 * `respond` matches on a substring of the SQL, so a test states what a given
 * statement should return without depending on the exact formatting.
 */
function fakeDb(
  respond: (sql: string, params: readonly unknown[]) => unknown[],
): { db: SqlExecutor; calls: Call[] } {
  const calls: Call[] = [];

  return {
    calls,
    db: {
      async query(sql, params = []) {
        calls.push({ sql, params });
        return { rows: respond(sql, params) as never[] };
      },
    },
  };
}

/** A `users` row as `pg` would return it: `bigint` as a string, `timestamptz` as a Date. */
function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc-1",
    github_id: "12345",
    login: "octocat",
    display_name: "The Octocat",
    avatar_url: null,
    verified: true,
    created_at: new Date("2026-10-13T00:00:00.000Z"),
    ...overrides,
  };
}

describe("createPostgresAccountStore — reads", () => {
  it("looks an account up by id with a bound parameter", async () => {
    const { db, calls } = fakeDb(() => [userRow()]);
    const store = createPostgresAccountStore(db);

    const account = await store.findById("acc-1");

    expect(calls[0].sql).toContain("WHERE id = $1");
    expect(calls[0].params).toEqual(["acc-1"]);
    expect(account?.githubId).toBe(12345);
    expect(account?.createdAt).toBe("2026-10-13T00:00:00.000Z");
  });

  it("looks an account up by GitHub id, the claim key", async () => {
    const { db, calls } = fakeDb(() => [userRow()]);

    await createPostgresAccountStore(db).findByGithubId(12345);

    expect(calls[0].sql).toContain("WHERE github_id = $1");
    expect(calls[0].params).toEqual([12345]);
  });

  it("returns null when there is no such account", async () => {
    const { db } = fakeDb(() => []);
    expect(await createPostgresAccountStore(db).findById("nope")).toBeNull();
  });

  it("returns null rather than a half-built account for an unreadable row", async () => {
    const { db } = fakeDb(() => [userRow({ github_id: null })]);

    // A row missing its claim key is a schema or driver mismatch, not an absent
    // account; returning null here would make `claimAccount` create a duplicate.
    expect(await createPostgresAccountStore(db).findById("acc-1")).toBeNull();
  });
});

describe("createPostgresAccountStore — save", () => {
  it("upserts on the id and returns what the database stored", async () => {
    const { db, calls } = fakeDb((sql) =>
      sql.includes("INSERT INTO users") ? [userRow({ login: "octocat-renamed" })] : [],
    );

    const stored = await createPostgresAccountStore(db).save({
      id: "acc-1",
      login: "octocat",
      githubId: 12345,
      displayName: "The Octocat",
      avatarUrl: null,
      createdAt: "2026-10-13T00:00:00.000Z",
      verified: true,
    });

    const sql = calls[0].sql;
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(sql).toContain("RETURNING");
    // Every value is bound, never concatenated.
    expect(calls[0].params).toEqual(["acc-1", 12345, "octocat", "The Octocat", null, true, "2026-10-13T00:00:00.000Z"]);
    expect(stored.login).toBe("octocat-renamed");
  });

  it("does not rewrite created_at, which is when the account was made", async () => {
    const { db, calls } = fakeDb(() => [userRow()]);

    await createPostgresAccountStore(db).save({
      id: "acc-1",
      login: "octocat",
      githubId: 12345,
      displayName: null,
      avatarUrl: null,
      createdAt: "2020-01-01T00:00:00.000Z",
      verified: true,
    });

    // The SET list is what runs on conflict. `RETURNING` legitimately re-lists
// every column, including `created_at`, so the slice stops before it.
const [afterConflict = ""] = calls[0].sql.split("DO UPDATE SET")[1]?.split("RETURNING") ?? [];
    expect(afterConflict).not.toContain("created_at");
    // It does update what a rename can change.
    expect(afterConflict).toContain("login");
  });

  it("throws rather than reporting an absent account when RETURNING is empty", async () => {
    const { db } = fakeDb(() => []);

    await expect(
      createPostgresAccountStore(db).save({
        id: "acc-1",
        login: "octocat",
        githubId: 12345,
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-10-13T00:00:00.000Z",
        verified: true,
      }),
    ).rejects.toThrow(/could not be read back/);
  });
});

describe("the SQL readers", () => {
  it("converts a bigint string, because pg does not return a JS number", () => {
    // JavaScript cannot hold a 64-bit integer exactly, so pg sends a string. A
    // store that read this as a number would compare `NaN` silently.
    expect(readNumber("9007199254740993")).toBe(9007199254740993);
    expect(readNumber("42")).toBe(42);
    expect(readNumber(7)).toBe(7);
    expect(readNumber(null)).toBeNull();
    expect(readNumber("not a number")).toBeNull();
  });

  it("normalises a timestamptz from a Date or a string", () => {
    expect(readIso(new Date("2026-10-13T00:00:00Z"))).toBe("2026-10-13T00:00:00.000Z");
    expect(readIso("2026-10-13T00:00:00Z")).toBe("2026-10-13T00:00:00.000Z");
    expect(readIso("nonsense")).toBeNull();
    expect(readIso(undefined)).toBeNull();
  });

  it("passes through text, booleans and row selection", () => {
    expect(readText("x")).toBe("x");
    expect(readText(null)).toBeNull();
    expect(readBoolean(false)).toBe(false);
    expect(firstRow([{ a: 1 }])).toEqual({ a: 1 });
    expect(firstRow([])).toBeNull();
    expect(allRows([1, 2])).toEqual([1, 2]);
  });
});