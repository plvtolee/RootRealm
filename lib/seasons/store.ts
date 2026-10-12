/**
 * RootRealm — the season store (TASKS 16.6).
 *
 * ```text
 * participation records and published standings, read and written as one unit
 * ```
 *
 * Two things need storing for the leaderboard to be real: who has opted in
 * (16.2), and which standings have been computed for publication. Neither is
 * persisted — TASKS 10.5's tables exist as a schema, not a driver — so this is the
 * same in-memory layer the account store and the wallet store use.
 *
 * ## Why the store is on `globalThis`
 *
 * Next compiles each route entry separately, so a module-scoped singleton would
 * give the leaderboard page and the opt-in route different stores, and a
 * developer's consent would not survive the round trip. `globalThis` is the one
 * object those bundles share — the same reason `walletStore` works.
 */
import type { SeasonConsent } from "./optin";
import type { RankStanding } from "./rank";

export interface SeasonStore {
  /** Every participation record. */
  consents(): Promise<readonly SeasonConsent[]>;
  /** Replaces the records, returning what was stored. */
  saveConsents(records: readonly SeasonConsent[]): Promise<readonly SeasonConsent[]>;
  /** Standings published for a season, most recently computed last. */
  standings(seasonId: string): Promise<readonly RankStanding[]>;
  /**
   * Appends a standing.
   *
   * Append-only, like `rank_snapshots` (TASKS 10.5): a standing is a statement
   * about a moment, so recomputing adds a record rather than editing one.
   */
  publish(standing: RankStanding): Promise<readonly RankStanding[]>;
}

export function createInMemorySeasonStore(
  seed: { readonly consents?: readonly SeasonConsent[]; readonly standings?: readonly RankStanding[] } = {},
): SeasonStore {
  let consents = [...(seed.consents ?? [])];
  const standings = new Map<string, RankStanding[]>();

  for (const standing of seed.standings ?? []) {
    const list = standings.get(standing.seasonId) ?? [];
    list.push(standing);
    standings.set(standing.seasonId, list);
  }

  return {
    async consents() {
      return consents;
    },

    async saveConsents(records) {
      consents = [...records];
      return consents;
    },

    async standings(seasonId) {
      return standings.get(seasonId) ?? [];
    },

    async publish(standing) {
      const list = [...(standings.get(standing.seasonId) ?? []), standing];
      standings.set(standing.seasonId, list);
      return list;
    },
  };
}

const GLOBAL_KEY = "__rootrealm_season_store__";

type GlobalWithSeasons = typeof globalThis & { [GLOBAL_KEY]?: SeasonStore };

/** The shared store, created on first use. Phase 10 deletes it. */
export function seasonStore(): SeasonStore {
  const scope = globalThis as GlobalWithSeasons;
  scope[GLOBAL_KEY] ??= createInMemorySeasonStore();
  return scope[GLOBAL_KEY] as SeasonStore;
}