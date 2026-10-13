/**
 * RootRealm — which store the process uses (TASKS 10.1, 10.7).
 *
 * ```text
 * DATABASE_URL present → PostgreSQL; absent → the in-memory placeholder
 * ```
 *
 * Both stores satisfy the same interface, and this is the only place that decides
 * between them. Routes ask for `accountStore()` and `walletStore()` and never
 * learn which they got — which is what lets the whole suite run with no database
 * while production runs against Postgres, and what makes "swap in the real store"
 * (the promise in `lib/currency/store.ts`) a change to one module rather than to
 * every route.
 *
 * ## Why the choice is not configurable
 *
 * It would be easy to add a flag that forces the in-memory store in production,
 * and it should not exist: with no database, a production restart silently wipes
 * every account, balance and purchase. The only honest failure mode for a
 * configured-but-unreachable database is to raise, so a misconfigured deployment
 * is visible rather than merely lossy.
 *
 * ## Why the singletons are on `globalThis`
 *
 * The in-memory stores must be shared across Next's separate route bundles, and
 * the reason is spelled out in `lib/currency/store.ts`. The Postgres stores are
 * stateless, but they are held the same way so the two are indistinguishable from
 * a caller's side and so swapping one for the other changes nothing at the call
 * sites.
 */
import { createInMemoryAccountStore, type AccountStore } from "../auth/account";
import {
  walletStore as inMemoryWalletStore,
  type WalletStore,
} from "../currency/store";

import { createPostgresAccountStore } from "./account-store";
import { createPostgresWalletStore } from "./wallet-store";
import { executor, hasDatabase } from "./postgres";

import type { DeletableAccountStore } from "../auth/delete-account";

const ACCOUNTS_KEY = "__rootrealm_account_store__";
const WALLETS_KEY = "__rootrealm_pg_wallet_store__";

type GlobalScope = typeof globalThis & {
  [ACCOUNTS_KEY]?: DeletableAccountStore;
  [WALLETS_KEY]?: WalletStore;
};

/**
 * An in-memory account store that can also delete.
 *
 * Deletion works here exactly as it does against the database — the account goes
 * and its id stops resolving — so the dev harness and a test exercise the same
 * contract. What differs is only durability: an in-memory deletion is undone by
 * the next restart, which is a dev-only property.
 */
function deletableMemoryStore(): DeletableAccountStore {
  const inner = createInMemoryAccountStore();
  const removed = new Set<string>();

  return {
    findById: (id) => (removed.has(id) ? Promise.resolve(null) : inner.findById(id)),
    findByGithubId: (githubId) => inner.findByGithubId(githubId),
    save: inner.save,
    async remove(id) {
      if (removed.has(id)) return false;
      removed.add(id);
      return (await inner.findById(id)) !== null;
    },
  };
}

/**
 * The account store.
 *
 * Postgres when `DATABASE_URL` is set, otherwise the in-memory placeholder. A
 * configured database that cannot be reached raises from the first query rather
 * than falling back — see the module header.
 */
export function accountStore(): DeletableAccountStore {
  const scope = globalThis as GlobalScope;

  if (scope[ACCOUNTS_KEY] === undefined) {
    const db = executor();

    scope[ACCOUNTS_KEY] =
      db === null ? deletableMemoryStore() : withRemoval(createPostgresAccountStore(db));
  }

  return scope[ACCOUNTS_KEY] as DeletableAccountStore;
}

/**
 * Adds the cascade delete to a Postgres account store.
 *
 * One statement. Ten tables reference `users` with `ON DELETE CASCADE`
 * (TASKS 10.6), so the account and every row derived from it — the coin ledger,
 * the inventory, the XP transactions, the unlocks, the rank snapshots — disappear
 * in the same statement that removes the account.
 *
 * That is the whole safety argument for a hard delete: there is no second store
 * to keep in step, and therefore no way to leave a developer's purchases behind
 * after their account is gone. `rowCount === 0` means there was nothing to
 * remove, which is reported rather than treated as a success.
 */
function withRemoval(store: AccountStore): DeletableAccountStore {
  return {
    findById: (id) => store.findById(id),
    findByGithubId: (githubId) => store.findByGithubId(githubId),
    save: (account) => store.save(account),

    async remove(userId) {
      const db = executor();
      if (db === null) return false;

      const result = await db.query("DELETE FROM users WHERE id = $1;", [userId]);

      // `pg` reports how many rows the statement touched. A missing count means
      // the driver did not say, which is not the same as zero rows — treating it
      // as "deleted nothing" would report a successful deletion as a no-op.
      return (result.rowCount ?? 1) > 0;
    },
  };
}

/** The wallet store. Same rule as {@link accountStore}. */
export function walletStore(): WalletStore {
  const scope = globalThis as GlobalScope;

  if (scope[WALLETS_KEY] === undefined) {
    const db = executor();

    scope[WALLETS_KEY] =
      db === null ? inMemoryWalletStore() : createPostgresWalletStore(db);
  }

  return scope[WALLETS_KEY] as WalletStore;
}

/**
 * Which backend this process is using, for a deployment check or a log line.
 */
export function storageBackend(): "postgres" | "memory" {
  return hasDatabase() ? "postgres" : "memory";
}

/**
 * Clears the cached stores.
 *
 * Required after `closePool()` (`lib/db/postgres.ts`). Each store captured the
 * executor built over the pool at construction time, so once that pool is ended
 * the cached store holds a dead one and every query fails with "Cannot use a pool
 * after calling end on the pool".
 *
 * This is a shutdown and test concern rather than a request-path one — nothing on
 * a live request closes the pool — but it is the invariant that makes "close the
 * pool and start again" mean anything, which is what proving persistence across a
 * restart requires.
 */
export function resetStores(): void {
  const scope = globalThis as GlobalScope;
  delete scope[ACCOUNTS_KEY];
  delete scope[WALLETS_KEY];
}