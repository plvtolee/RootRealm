/**
 * RootRealm — the progression store (TASKS 11.2–11.3).
 *
 * ```text
 * a sync's outcome → durable rows, or a durable "already seen"
 * ```
 *
 * ## Why this exists
 *
 * `lib/sync/engine.ts` is pure: it takes events and the state already recorded,
 * and returns what should change. Something has to own the other half — reading
 * that state back and writing the result — and until now nothing did. The tables
 * existed (`developer_events`, `xp_transactions`, `achievement_unlocks`) and no
 * code had ever written to them.
 *
 * ## The ordering constraint that shapes everything here
 *
 * `xp_transactions.event_id` references `developer_events.id` with
 * `ON DELETE CASCADE`, so an award cannot be written before its event exists.
 * Every write path therefore persists events *first*. A sync that scored an event
 * it had not stored would fail at the database rather than at a review, which is
 * the right order for a correctness bug to be found in.
 *
 * ## Idempotency is the primary key, not a convention
 *
 * `xp_transactions.id` *is* `xp:<login>:<eventId>:<scoringVersion>` and is the
 * table's primary key (DATA_CONTRACT §4). The second sync of the same event
 * therefore cannot write a second award even if every check in the service is
 * wrong. `ON CONFLICT DO NOTHING` is belt to that braces: the engine already
 * filters duplicates, and this is what makes the guarantee hold if a future
 * caller forgets.
 */
import type { DeveloperEvent } from "../developer-event";
import type { RepositoryRecord } from "../github/repositories";
import type { LedgerEntry } from "../scoring/ledger";
import type { AchievementUnlock } from "../achievements/unlock";

/**
 * Durable progression.
 *
 * An interface rather than a direct query so the sync service is testable
 * without a database, and so an in-memory store can be honestly incomplete — see
 * {@link createInMemoryProgressionStore}.
 */
export interface ProgressionStore {
  /**
   * Records the repositories an event may point at. Returns how many were new.
   *
   * Must run before {@link saveEvents}: `developer_events.repository_id`
   * references `repositories`, and the database enforces it. An in-memory store
   * has no foreign keys and cannot catch a caller that skips this — which is how
   * the ordering bug that this method exists to prevent survived the entire E2E
   * suite and only appeared against a real Postgres.
   */
  saveRepositories(
    login: string,
    repositories: readonly RepositoryRecord[],
  ): Promise<number>;

  /**
   * Records normalized events. Returns how many were newly written.
   *
   * Must be called after {@link saveRepositories} and before
   * {@link recordTransactions}: two foreign keys sit between an award and the
   * work it is for.
   */
  saveEvents(login: string, events: readonly DeveloperEvent[]): Promise<number>;

  /**
   * The idempotency keys already awarded to this developer.
   *
   * This is what makes a repeat sync a no-op. It is read by key rather than
   * counted, because the engine has to recognise each duplicate individually.
   */
  awardedKeys(userId: string): Promise<ReadonlySet<string>>;

  /** Achievement ids already earned by this developer. */
  earnedAchievementIds(userId: string): Promise<ReadonlySet<string>>;

  /** Writes awards. Returns how many were new; duplicates are skipped, not overwritten. */
  recordTransactions(
    userId: string,
    login: string,
    entries: readonly LedgerEntry[],
  ): Promise<number>;

  /** Writes achievement unlocks. Returns how many were new. */
  recordAchievementUnlocks(
    userId: string,
    unlocks: readonly AchievementUnlock[],
  ): Promise<number>;

  /** Total XP awarded to date, for the profile. */
  totalXp(userId: string): Promise<number>;
}

/* ------------------------------------------------------------------ *
 * In-memory
 * ------------------------------------------------------------------ */

/**
 * A progression store that keeps everything in a `Map`.
 *
 * Contract-identical to the Postgres one for everything the sync service calls,
 * which is what lets the E2E suite exercise a real sync without a database. What
 * differs is durability, and only durability: an in-memory sync is undone by the
 * next restart, which is a development-only property.
 */
export function createInMemoryProgressionStore(): ProgressionStore {
  const repositories = new Map<number, RepositoryRecord>();
  const events = new Map<string, DeveloperEvent>();
  const keys = new Map<string, Set<string>>();
  const earned = new Map<string, Set<string>>();
  const xp = new Map<string, number>();

  const setFor = (map: Map<string, Set<string>>, userId: string): Set<string> => {
    let existing = map.get(userId);
    if (existing === undefined) {
      existing = new Set<string>();
      map.set(userId, existing);
    }
    return existing;
  };

  return {
    async saveRepositories(_login, batch) {
      let written = 0;
      for (const repository of batch) {
        // Keyed by GitHub's numeric id, which is what the schema keys by and what
        // survives a rename or a transfer.
        if (repository.repositoryId === null) continue;
        if (repositories.has(repository.repositoryId)) continue;
        repositories.set(repository.repositoryId, repository);
        written += 1;
      }
      return written;
    },

    async saveEvents(login, batch) {
      let written = 0;
      for (const event of batch) {
        // The same key is the same event: an event-scoped id means a repeated
        // observation is a duplicate, not a new fact.
        if (events.has(event.id)) continue;
        events.set(event.id, event);
        written += 1;
      }
      void login;
      return written;
    },

    async awardedKeys(userId) {
      return new Set(setFor(keys, userId));
    },

    async earnedAchievementIds(userId) {
      return new Set(setFor(earned, userId));
    },

    async recordTransactions(userId, _login, entries) {
      const held = setFor(keys, userId);
      let written = 0;
      for (const entry of entries) {
        if (held.has(entry.id)) continue;
        held.add(entry.id);
        xp.set(userId, (xp.get(userId) ?? 0) + entry.xp);
        written += 1;
      }
      return written;
    },

    async recordAchievementUnlocks(userId, unlocks) {
      const held = setFor(earned, userId);
      let written = 0;
      for (const unlock of unlocks) {
        if (held.has(unlock.achievementId)) continue;
        held.add(unlock.achievementId);
        written += 1;
      }
      return written;
    },

    async totalXp(userId) {
      return xp.get(userId) ?? 0;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Postgres
 * ------------------------------------------------------------------ */

/** What the store needs from the database, so it can be constructed from either. */
export interface ProgressionExecutor {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ readonly rows: Record<string, unknown>[] }>;
}

/**
 * The Postgres-backed progression store.
 *
 * Every write is `ON CONFLICT DO NOTHING`. That is not defensive programming —
 * it is the mechanism. `xp_transactions.id` is the idempotency key and is the
 * primary key, so "do not award twice" is enforced by the database rather than by
 * the service remembering to check.
 */
export function createPostgresProgressionStore(db: ProgressionExecutor): ProgressionStore {
  return {
    async saveRepositories(_login, batch) {
      // A repository with no GitHub id cannot be keyed, because `repository_id`
      // is the primary key. Dropping it is honest: an event pointing at it will
      // store a null repository_id rather than a reference to nothing.
      const identified = batch.filter(
        (repository): repository is RepositoryRecord & { repositoryId: number } =>
          repository.repositoryId !== null,
      );

      if (identified.length === 0) return 0;

      const values: unknown[] = [];
      const tuples = identified.map((repository, index) => {
        const base = index * 12;
        values.push(
          repository.repositoryId,
          repository.fullName,
          repository.slug,
          repository.ownerLogin,
          repository.name,
          repository.description,
          repository.url,
          repository.primaryLanguage,
          repository.isFork,
          repository.isArchived,
          repository.stars,
          JSON.stringify(repository),
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}::jsonb)`;
      });

      // `ON CONFLICT` with no target, deliberately. Both `repository_id` (the
      // primary key) and `slug` are unique, and they can disagree: a renamed
      // repository keeps its id and changes its slug, so a conflict can arrive on
      // either. Naming one target would let the other raise.
      const result = await db.query(
        `INSERT INTO repositories
           (repository_id, full_name, slug, owner_login, name, description, url,
            primary_language, is_fork, is_archived, stars, source)
         VALUES ${tuples.join(", ")}
         ON CONFLICT DO NOTHING;`,
        values,
      );

      return rowCount(result);
    },

    async saveEvents(login, batch) {
      if (batch.length === 0) return 0;

      // One statement for the whole batch rather than one per event: a developer
      // with 400 events would otherwise be 400 round trips inside one request.
      const values: unknown[] = [];
      const tuples = batch.map((event, index) => {
        const base = index * 11;
        values.push(
          event.id,
          login,
          event.developerId,
          event.repositoryId,
          event.repositoryFullName,
          event.kind,
          event.occurredAt,
          event.visibility,
          event.confidence,
          event.relevance,
          // The evidence and the limitations travel together: SCORING.md §17
          // requires the ledger to be able to explain an award, and a stored
          // event that cannot say what it could not support cannot do that.
          JSON.stringify({ evidence: event.evidence ?? null, limitations: event.limitations }),
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}::jsonb)`;
      });

      const result = await db.query(
        `INSERT INTO developer_events
           (id, developer_login, developer_id, repository_id, repository_full_name,
            kind, occurred_at, visibility, confidence, relevance, payload)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (id) DO NOTHING;`,
        values,
      );

      return rowCount(result);
    },

    async awardedKeys(userId) {
      const result = await db.query(
        "SELECT id FROM xp_transactions WHERE user_id = $1;",
        [userId],
      );
      return new Set(result.rows.map((row) => String(row.id)));
    },

    async earnedAchievementIds(userId) {
      const result = await db.query(
        "SELECT achievement_id FROM achievement_unlocks WHERE user_id = $1;",
        [userId],
      );
      return new Set(result.rows.map((row) => String(row.achievement_id)));
    },

    async recordTransactions(userId, login, entries) {
      if (entries.length === 0) return 0;

      const values: unknown[] = [];
      const tuples = entries.map((entry, index) => {
        const base = index * 10;
        values.push(
          entry.id,
          userId,
          entry.eventId,
          login,
          entry.xp,
          entry.classification,
          entry.reason,
          entry.ruleId,
          JSON.stringify(entry.breakdown ?? []),
          // Not optional and not nullable: SCORING.md §3 requires every award to
          // name the version that produced it, and the column's foreign key to
          // `scoring_versions` is what makes that enforceable rather than
          // aspirational.
          entry.scoringVersion,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}::jsonb, $${base + 10})`;
      });

      const result = await db.query(
        `INSERT INTO xp_transactions
           (id, user_id, event_id, developer_login, xp, classification, reason, rule_id,
            lines, scoring_version_id)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (id) DO NOTHING;`,
        values,
      );

      return rowCount(result);
    },

    async recordAchievementUnlocks(userId, unlocks) {
      if (unlocks.length === 0) return 0;

      const values: unknown[] = [];
      const tuples = unlocks.map((unlock, index) => {
        const base = index * 4;
        values.push(
          `${userId}:${unlock.achievementId}`,
          userId,
          unlock.achievementId,
          JSON.stringify(unlock.evidenceEventIds),
        );
        // `unlocked_at` defaults to now() in the schema. The unlock's own
        // `unlockedAt` is deliberately *not* used here: it is the engine's
        // deterministic clock, which is right for the returned record and wrong
        // for a durable one written minutes later by a retry.
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, now())`;
      });

      // The unique constraint on (user_id, achievement_id) is what makes a
      // second unlock impossible, so the conflict target names it rather than
      // the surrogate id.
      const result = await db.query(
        `INSERT INTO achievement_unlocks
           (id, user_id, achievement_id, evidence_event_ids, unlocked_at)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (user_id, achievement_id) DO NOTHING;`,
        values,
      );

      return rowCount(result);
    },

    async totalXp(userId) {
      const result = await db.query(
        "SELECT COALESCE(SUM(xp), 0)::int AS total FROM xp_transactions WHERE user_id = $1;",
        [userId],
      );
      return Number(result.rows[0]?.total ?? 0);
    },
  };
}

/**
 * How many rows an insert actually added.
 *
 * `ON CONFLICT DO NOTHING` returning zero is the normal, expected outcome for a
 * repeat sync — it is the idempotency guarantee working — so it is not treated
 * as a failure anywhere.
 */
function rowCount(result: { readonly rows: Record<string, unknown>[] }): number {
  const reported = (result as { rowCount?: number | null }).rowCount;
  return typeof reported === "number" ? reported : result.rows.length;
}