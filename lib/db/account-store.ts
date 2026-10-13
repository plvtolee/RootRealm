/**
 * RootRealm — the PostgreSQL account store (TASKS 9.2, 9.3, 10.1).
 *
 * ```text
 * verified GitHub identity → the `users` row it belongs to
 * ```
 *
 * The in-memory store in `lib/auth/account.ts` decides *which* account an
 * identity belongs to; this one decides where the answer is kept. `claimAccount`
 * is unchanged and driver-agnostic, which is what Phase 10's interface was for.
 *
 * ## Why the claim key is a unique column, not a lookup
 *
 * `users.github_id` is `UNIQUE` in the schema. That is the structural half of
 * "signing in twice returns the same account": the login is display and can be
 * renamed, the id cannot, and the database — not a `findByGithubId` that might
 * be forgotten — is what makes two sign-ins collide. The lookup below exists for
 * the fast path; the constraint is what makes it correct under concurrency.
 *
 * ## Why `save` conflicts on the id and not on the GitHub id
 *
 * `save`'s contract is "insert or replace this account", and the id is the
 * account's identity. A `github_id` collision with a *different* id is a genuine
 * conflict — two RootRealm accounts claiming one GitHub identity, which cannot
 * happen through `claimAccount` — so it is left to raise rather than being
 * silently resolved by overwriting someone else's account. Failing loudly here is
 * the correct outcome; silently reassigning would be the one that loses data.
 */
import type { Account, AccountStore } from "../auth/account";
import {
  allRows,
  firstRow,
  readBoolean,
  readIso,
  readNumber,
  readText,
  type SqlExecutor,
} from "./sql";

/** A `users` row, in the column names the schema gives them. */
interface UserRow {
  id: unknown;
  github_id: unknown;
  login: unknown;
  display_name: unknown;
  avatar_url: unknown;
  verified: unknown;
  created_at: unknown;
}

const COLUMNS = "id, github_id, login, display_name, avatar_url, verified, created_at";

/** Narrowing a raw row to the domain type. The only place `bigint`-as-string is handled. */
function toAccount(row: UserRow): Account | null {
  const id = readText(row.id);
  const login = readText(row.login);
  const githubId = readNumber(row.github_id);
  const createdAt = readIso(row.created_at);

  if (id === null || login === null || githubId === null || createdAt === null) return null;

  return {
    id,
    login,
    githubId,
    displayName: readText(row.display_name),
    avatarUrl: readText(row.avatar_url),
    createdAt,
    verified: readBoolean(row.verified) ?? false,
  };
}

/**
 * The account store backed by the `users` table.
 *
 * Takes an {@link SqlExecutor} rather than importing the pool, so it can be
 * tested against a fake that records the SQL it issued — which is how the claim
 * behaviour is held to the database rather than to a description of it.
 */
export function createPostgresAccountStore(db: SqlExecutor): AccountStore {
  return {
    async findById(id) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM users WHERE id = $1 LIMIT 1;`,
        [id],
      );
      const row = firstRow<UserRow>(rows);
      return row === null ? null : toAccount(row);
    },

    async findByGithubId(githubId) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM users WHERE github_id = $1 LIMIT 1;`,
        [githubId],
      );
      const row = firstRow<UserRow>(rows);
      return row === null ? null : toAccount(row);
    },

    /**
     * Inserts, or replaces the fields that can change on a returning developer.
     *
     * `created_at` is deliberately absent from the update: it is when the account
     * was created, not when the developer last signed in, and a rename must not
     * reset it. `RETURNING` gives back the stored row so the caller sees what the
     * database holds rather than what it asked for.
     */
    async save(account) {
      const { rows } = await db.query(
        `INSERT INTO users (id, github_id, login, display_name, avatar_url, verified, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           github_id = EXCLUDED.github_id,
           login = EXCLUDED.login,
           display_name = EXCLUDED.display_name,
           avatar_url = EXCLUDED.avatar_url,
           verified = EXCLUDED.verified
         RETURNING ${COLUMNS};`,
        [
          account.id,
          account.githubId,
          account.login,
          account.displayName,
          account.avatarUrl,
          account.verified,
          account.createdAt,
        ],
      );

      const row = firstRow<UserRow>(rows);
      const stored = row === null ? null : toAccount(row);

      // A RETURNING row that will not narrow is a schema or driver mismatch, not
      // an absent account: the insert succeeded, so silently returning null would
      // turn a real inconsistency into "this developer has no account".
      if (stored === null) {
        throw new Error("Account row was written but could not be read back.");
      }

      return stored;
    },
  };
}

/** Every account, for a seed or an operator query. Not used on a request path. */
export async function listAccounts(db: SqlExecutor): Promise<Account[]> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM users ORDER BY created_at;`);
  return allRows<UserRow>(rows)
    .map(toAccount)
    .filter((account): account is Account => account !== null);
}