/**
 * RootRealm — the synchronization service (TASKS 11.2–11.4).
 *
 * ```text
 * a signed-in developer asks to sync → events are stored, awards are recorded once, and the run is reported
 * ```
 *
 * ## What this is, and what it was
 *
 * `lib/sync/engine.ts` has always existed and always worked: given events and the
 * state already recorded, it returns what should change. But nothing ever called
 * it, so "sync" was a tested function with no way to run. This is the half that
 * fetches, persists and reports — the reason the engine exists.
 *
 * It is also what makes `logSyncJob` and `logRecoveryDecision` real. Both were
 * library-only because there was no orchestrator to emit them.
 *
 * ## What this deliberately does not do
 *
 * **It does not run on a schedule.** There is no cron, no queue and no worker.
 * A sync happens when a developer asks for one. A scheduler is the right answer
 * eventually and is not in scope here; pretending otherwise would put a timer in
 * the product before there is anything for it to do.
 *
 * **It does not write attributes, skills or quests.** The engine's outcome is
 * transactions and achievement unlocks; attributes, skills and levels are derived
 * from those at read time. Inventing a second write path for data that is already
 * computed would be a new design decision, not an implementation.
 *
 * ## The one thing that makes a repeat sync safe
 *
 * The engine reads the awarded keys before it scores, and the database enforces
 * the same rule independently (`xp_transactions.id` is the primary key). Both are
 * deliberate. The service check keeps the second run cheap and its counters
 * honest; the database check means a bug in the service cannot double-award
 * anyone. Either alone would be a weaker guarantee.
 */
import { fetchActivity, fetchPullRequestTestFiles } from "../github/activity";
import { fetchPublicProfile, createProfileClient } from "../github/profile";
import { fetchRepositories } from "../github/repositories";
import { normalizeActivity } from "../developer-event";
import { dedupeEvents } from "../event-dedupe";
import { synchronize } from "./engine";
import {
  completePhase,
  failSyncJob,
  markPartial,
  startSyncJob,
  succeedSyncJob,
  withCounters,
  type SyncJob,
} from "./job";
import { decideRecovery, type RecoveryDecision } from "./recovery";
import { ACHIEVEMENT_DEFINITIONS } from "../achievements/definition";
import type { ProgressionStore } from "../db/progression-store";
import { logRecoveryDecision, logSyncJob, serviceLogger } from "../ops/monitoring";
import type { FailureReason, IngestionFailure } from "../github/failure";

/** Why a sync did not run, when it did not. */
export type SyncRefusal =
  /** No trusted session: this request belongs to nobody. */
  | "unauthenticated"
  /** The session names an account that is no longer there. */
  | "not_found"
  /** GitHub would not answer, so there is nothing honest to sync from. */
  | "ingestion_failed";

export interface SyncResult {
  readonly ok: boolean;
  readonly refusal?: SyncRefusal;
  /** Human-readable reason, safe to show. Never contains a token. */
  readonly message?: string;
  /** The job record, whether the run succeeded, failed or was refused. */
  readonly job: SyncJob;
  /** What the run decided to do about a failure, when there was one. */
  readonly recovery?: RecoveryDecision;
  /** XP written this run. Zero on a repeat sync, which is the point. */
  readonly xpAwarded?: number;
  readonly achievementsUnlocked?: number;
  /** Total XP after this run, from the store. */
  readonly totalXp?: number;
}

/**
 * Runs one synchronization pass for a signed-in developer.
 *
 * @param userId The account's id. Taken from the session, never from a request
 *   body — a sync that awards to whoever the caller names is not a sync.
 */
export async function runSync(input: {
  readonly userId: string | null;
  readonly login: string;
  readonly store: ProgressionStore;
  /** Injected so a test can fix the clock. Defaults to now. */
  readonly at?: string;
  readonly signal?: AbortSignal;
}): Promise<SyncResult> {
  const logger = serviceLogger("sync");
  const at = input.at ?? new Date().toISOString();

  let job = startSyncJob({
    id: `sync:${input.login}:${at}`,
    developerLogin: input.login,
    startedAt: at,
  });

  if (input.userId === null) {
    logger.warn("sync.unauthenticated", { login: input.login });
    job = failSyncJob(job, "unauthenticated", at);

    // No recovery decision. `decideRecovery` reasons about a *GitHub* failure
    // and whether to try again; a request that was never authenticated never
    // reached GitHub, so there is nothing to retry and nothing to decide. Emitting
    // one here would put a misleading line in the log that an operator might act
    // on.
    return {
      ok: false,
      refusal: "unauthenticated",
      message: "Sign in to sync your account.",
      job,
    };
  }

  /* --- fetch ------------------------------------------------------- */

  const client = createProfileClient();
  const signal = input.signal;

  const [profile, repositories, activity] = await Promise.all([
    fetchPublicProfile(client, input.login, { signal }),
    fetchRepositories(client, input.login, { signal }),
    fetchActivity(client, input.login, { signal }),
  ]);

  // Activity is checked first: without events there is nothing to score, whatever
  // the repository call did. The two failures are reported separately rather than
  // unioned because each result type narrows differently, and a union of two
  // discriminated results is a union TypeScript cannot narrow for us.
  if (!activity.ok) {
    return refuse(job, activity.failure, at, input.login, logger);
  }

  if (!repositories.ok) {
    return refuse(job, repositories.failure, at, input.login, logger);
  }

  const pullRequestTestFiles = await fetchPullRequestTestFiles(
    client,
    activity.observation.events,
    { signal },
  );

  job = completePhase(job, "fetch");

  /* --- normalize --------------------------------------------------- */

  const normalized = normalizeActivity(activity.observation.events, {
    developerLogin: input.login,
    developerId: profile.ok ? profile.profile.githubId : null,
    confirmedRepositoryIds: new Set(
      repositories.observation.repositories
        .map((repository) => repository.repositoryId)
        .filter((id): id is number => id !== null),
    ),
    pullRequestTestFiles,
  });

  // `dedupeEvents` returns a result, not a list: the duplicates it collapsed and
  // the identities carried over from a previous run are part of what the job
  // record should say, and dropping them here would lose that.
  const deduped = dedupeEvents(normalized.events);
  const events = deduped.events;
  job = completePhase(job, "normalize");

  // Order matters twice over, and the database is what proves it.
  //
  // Repositories first: `developer_events.repository_id` references them.
  // Events second: `xp_transactions.event_id` references those.
  //
  // This ordering is not obvious and nothing enforced it until a real Postgres
  // did — the in-memory store has no foreign keys, so the entire E2E suite
  // passed while the sync would have thrown `23503` against the real database.
  await input.store.saveRepositories(input.login, repositories.observation.repositories);
  await input.store.saveEvents(input.login, events);

  /* --- score ------------------------------------------------------- */

  // The state the engine needs is read from the store, not from memory. That is
  // what makes this the *second* sync rather than the first one twice.
  const [awardedKeys, earnedAchievementIds] = await Promise.all([
    input.store.awardedKeys(input.userId),
    input.store.earnedAchievementIds(input.userId),
  ]);

  const outcome = synchronize({
    developerLogin: input.login,
    events,
    state: { awardedKeys, earnedAchievementIds },
    achievements: ACHIEVEMENT_DEFINITIONS,
    at,
  });

  job = completePhase(job, "score");

  /* --- persist ----------------------------------------------------- */

  const transactionsWritten = await input.store.recordTransactions(
    input.userId,
    input.login,
    outcome.transactions,
  );
  const achievementsWritten = await input.store.recordAchievementUnlocks(
    input.userId,
    outcome.achievementUnlocks,
  );

  job = completePhase(job, "progression");
  job = withCounters(job, {
    ...outcome.counters,
    // The store's counts are the ones that matter: the engine reports what it
    // *decided*, and a database that already held the row wrote nothing. Those
    // two disagreeing is not an error — it is the idempotency guarantee working.
    transactionsWritten,
    achievementsUnlocked: achievementsWritten,
  });
  job = succeedSyncJob(job, at);

  logger.info("sync.completed", {
    login: input.login,
    transactionsWritten,
    achievementsWritten,
    xpAwarded: outcome.counters.xpAwarded,
    duplicates: outcome.counters.eventsDuplicate,
  });

  // Emitted for the first time. `logSyncJob` existed since TASKS 11.2 with
  // nothing to report it.
  logSyncJob(job, logger);

  return {
    ok: true,
    job,
    xpAwarded: outcome.counters.xpAwarded,
    achievementsUnlocked: achievementsWritten,
    totalXp: await input.store.totalXp(input.userId),
  };
}

/**
 * Reports a run GitHub could not complete.
 *
 * GitHub declining is an ordinary outcome, not an exception: a run that treats a
 * rate limit as a crash teaches an operator to ignore the errors that matter.
 *
 * The reason comes from the fetch itself rather than being invented here, because
 * the recovery policy distinguishes "try again when the budget resets" from "there
 * is no such account" — and only GitHub knows which it was. Inventing a single
 * generic "ingestion failed" reason here would collapse exactly the distinction
 * the policy exists to make.
 */
function refuse(
  job: SyncJob,
  failure: IngestionFailure,
  at: string,
  login: string,
  logger: ReturnType<typeof serviceLogger>,
): SyncResult {
  logger.warn("sync.ingestion_failed", { login, reason: failure.reason });

  let next = completePhase(job, "fetch");
  next = markPartial(next, `ingestion failed: ${failure.reason}`, at);

  // `retryAfterMs` comes from GitHub's own budget, already collapsed by
  // `IngestionFailure`. Nothing here reinterprets it.
  const recovery = recoveryFor(next, failure.reason, failure.retryAfterMs);
  logRecovery(logger, recovery, login);

  return {
    ok: false,
    refusal: "ingestion_failed",
    // GitHub's user-safe wording, not a second copy of it.
    message: failure.message,
    job: next,
    recovery,
  };
}

/**
 * What the recovery policy says to do about a job that did not succeed.
 *
 * `decideRecovery` takes a failure reason rather than a job, so the reason is
 * passed explicitly at each call site. Attempt 1 is right because this service
 * has no retry loop: a retry would be a scheduler, which is deliberately not in
 * scope. The decision is still computed and logged, because "stop_partial" versus
 * "retry_now" is the information an operator needs to read in the morning.
 */
function recoveryFor(
  job: SyncJob,
  reason: FailureReason,
  retryAfterMs: number | null = null,
): RecoveryDecision {
  return decideRecovery({
    reason,
    attempt: 1,
    retryAfterMs,
    recordedProgress: job.status === "partial",
  });
}

/** Reports a recovery decision alongside the job that produced it. */
function logRecovery(
  logger: ReturnType<typeof serviceLogger>,
  decision: RecoveryDecision,
  login: string,
): void {
  logRecoveryDecision(decision, { developerLogin: login }, logger);
}
