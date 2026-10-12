/**
 * RootRealm — synchronization jobs (TASKS 11.1).
 *
 * ```text
 * one sync attempt → one job record: what ran, what it produced, how it ended
 * ```
 *
 * TASKS 11.1 asks for synchronization tracking. A sync touches several systems —
 * GitHub, normalization, scoring, achievement evaluation — and those systems fail
 * independently. Without a record of the attempt, "why is my XP 40 short?" has
 * no answer, and TASKS 11.4's recovery has nothing to decide from.
 *
 * ## Why the job is a state machine, not a log
 *
 * A job has phases and one ending. Modelling it as a log of lines would let a
 * reader see two endings, or a phase that ran after the job finished. The
 * transitions here are the only way to build a job, so those states cannot be
 * expressed.
 *
 * ## The four endings, and why `partial` exists
 *
 * - `succeeded` — every phase ran, the run is complete.
 * - `partial` — some progress was recorded, but the run did not finish. This is
 *   a real and common outcome: the activity feed is capped at 300 events
 *   (TASKS 4.4), so a busy developer's sync is *always* partial. Reporting it as
 *   a failure would mean admitting that the ceiling exists is admitting something
 *   broke.
 * - `failed` — nothing was recorded.
 * - `running` — the job has not ended.
 *
 * ## Counters are about the run, not the account
 *
 * `eventsDuplicate` counts the events this run recognised as already awarded. It
 * is the visible evidence of TASKS 11.3's "avoid duplicate XP": a second sync
 * over unchanged activity reports a high duplicate count and writes nothing.
 */
import type { Attribute } from "../scoring/types";

/** The phases of a sync, in the order they run (TASKS 11.2). */
export type SyncPhase = "fetch" | "normalize" | "score" | "progression";

/** Every phase, in order. */
export const SYNC_PHASES: readonly SyncPhase[] = ["fetch", "normalize", "score", "progression"];

/** How a job ended. */
export type SyncJobStatus = "running" | "succeeded" | "partial" | "failed";

/** What one run produced. */
export interface SyncCounters {
  /** Events the ingestion walk returned, before deduplication. */
  readonly eventsObserved: number;
  /** Events this run had not seen before (they produced new awards). */
  readonly eventsNew: number;
  /** Events already awarded by an earlier run, so they wrote nothing. */
  readonly eventsDuplicate: number;
  /** XP written by this run. */
  readonly xpAwarded: number;
  /** XP transactions written by this run. */
  readonly transactionsWritten: number;
  /** Achievements unlocked by this run. */
  readonly achievementsUnlocked: number;
}

/** A run with no counters yet. */
export const EMPTY_COUNTERS: SyncCounters = {
  eventsObserved: 0,
  eventsNew: 0,
  eventsDuplicate: 0,
  xpAwarded: 0,
  transactionsWritten: 0,
  achievementsUnlocked: 0,
};

/** One synchronization attempt. */
export interface SyncJob {
  /** Stable id for the attempt, so a log line can be traced to a record. */
  readonly id: string;
  /** The developer the run belongs to. */
  readonly developerLogin: string;
  /** When it started, ISO-8601. */
  readonly startedAt: string;
  /** When it ended, ISO-8601, or null while running. */
  readonly finishedAt: string | null;
  readonly status: SyncJobStatus;
  /** Phases that completed, in order. */
  readonly completedPhases: readonly SyncPhase[];
  readonly counters: SyncCounters;
  /**
   * Why the run did not succeed, when it did not.
   *
   * A closed reason from the failure taxonomy (TASKS 4.2), not a stack trace: the
   * record is shown to a developer, so it must not carry internals.
   */
  readonly failureReason: string | null;
}

/** Starts a job. A fresh job is `running` with no phases done. */
export function startSyncJob(input: {
  readonly id: string;
  readonly developerLogin: string;
  readonly startedAt: string;
}): SyncJob {
  return {
    id: input.id,
    developerLogin: input.developerLogin,
    startedAt: input.startedAt,
    finishedAt: null,
    status: "running",
    completedPhases: [],
    counters: EMPTY_COUNTERS,
    failureReason: null,
  };
}

/**
 * Marks a phase complete.
 *
 * Phases are declared in order and appended in order; completing a phase twice is
 * a no-op rather than a duplicate entry, and completing one out of order is
 * refused, because a job whose phases are out of order would misreport where a
 * failure happened.
 */
export function completePhase(job: SyncJob, phase: SyncPhase): SyncJob {
  if (job.status !== "running") {
    throw new Error(`Cannot complete phase ${phase} on a ${job.status} job.`);
  }
  if (job.completedPhases.includes(phase)) return job;

  const expected = SYNC_PHASES[job.completedPhases.length];
  if (expected !== phase) {
    throw new Error(
      `Sync phase ${phase} cannot follow ${job.completedPhases.at(-1) ?? "start"}; ` +
        `expected ${expected ?? "no further phase"}.`,
    );
  }

  return { ...job, completedPhases: [...job.completedPhases, phase] };
}

/** Replaces the counters, for the phase that produced them. */
export function withCounters(job: SyncJob, counters: SyncCounters): SyncJob {
  return { ...job, counters };
}

/** Ends a job successfully: every phase ran. */
export function succeedSyncJob(job: SyncJob, finishedAt: string): SyncJob {
  if (job.completedPhases.length !== SYNC_PHASES.length) {
    throw new Error(
      `A sync cannot succeed after ${job.completedPhases.length} of ` +
        `${SYNC_PHASES.length} phases; it is partial or failed.`,
    );
  }
  return { ...job, status: "succeeded", finishedAt };
}

/**
 * Ends a job that recorded progress but did not finish.
 *
 * The distinction from {@link failSyncJob} is whether anything was written. A
 * sync cut short by the activity ceiling is partial; one that never got past the
 * profile lookup is failed. Reporting the first as a failure would tell a
 * developer their account is broken when it is working correctly within a
 * documented limit (TASKS 4.4).
 */
export function markPartial(
  job: SyncJob,
  reason: string,
  finishedAt: string,
): SyncJob {
  return { ...job, status: "partial", finishedAt, failureReason: reason };
}

/** Ends a job that recorded nothing. */
export function failSyncJob(job: SyncJob, reason: string, finishedAt: string): SyncJob {
  return { ...job, status: "failed", finishedAt, failureReason: reason };
}

/** Whether the job has ended. */
export function isFinished(job: SyncJob): boolean {
  return job.status !== "running";
}

/** The phases that did not complete. */
export function remainingPhases(job: SyncJob): readonly SyncPhase[] {
  return SYNC_PHASES.filter((phase) => !job.completedPhases.includes(phase));
}

/** A counter summary keyed by attribute, for the progression phase. */
export type AttributeTotals = Readonly<Record<Attribute, number>>;

/**
 * Adds two counter sets, for a run composed of more than one pass.
 *
 * Kept here rather than in the engine because counters are a job concept, and a
 * resumed job has to be able to continue from where it stopped (TASKS 11.4).
 */
export function addCounters(a: SyncCounters, b: SyncCounters): SyncCounters {
  return {
    eventsObserved: a.eventsObserved + b.eventsObserved,
    eventsNew: a.eventsNew + b.eventsNew,
    eventsDuplicate: a.eventsDuplicate + b.eventsDuplicate,
    xpAwarded: a.xpAwarded + b.xpAwarded,
    transactionsWritten: a.transactionsWritten + b.transactionsWritten,
    achievementsUnlocked: a.achievementsUnlocked + b.achievementsUnlocked,
  };
}