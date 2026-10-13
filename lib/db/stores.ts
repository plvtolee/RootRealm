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

const ACCOUNTS_KEY = "__rootrealm_account_store__";
const WALLETS_KEY = "__rootrealm_pg_wallet_store__";

type GlobalScope = typeof globalThis & {
  [ACCOUNTS_KEY]?: AccountStore;
  [WALLETS_KEY]?: WalletStore;
};

/**
 * The account store.
 *
 * Postgres when `DATABASE_URL` is set, otherwise the in-memory placeholder. A
 * configured database that cannot be reached raises from the first query rather
 * than falling back — see the module header.
 */
export function accountStore(): AccountStore {
  const scope = globalThis as GlobalScope;

  if (scope[ACCOUNTS_KEY] === undefined) {
    const db = executor();

    scope[ACCOUNTS_KEY] =
      db === null
        ? createInMemoryAccountStore()
        : createPostgresAccountStore(db);
  }

  return scope[ACCOUNTS_KEY] as AccountStore;
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