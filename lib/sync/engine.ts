/**
 * RootRealm — the synchronization engine (TASKS 11.2–11.4).
 *
 * ```text
 * GitHub → ingestion → normalization → progression, idempotently
 * ```
 *
 * TASKS 11.2 is the initial sync, TASKS 11.3 is the repeat sync, and they are the
 * same code path: the difference between a first run and a second is not a
 * branch, it is what the stores already contain. Writing them as one pure
 * function over (events, existing state) is what makes 11.3's guarantees fall out
 * rather than needing to be remembered:
 *
 * - **detect existing events** — the ledger is keyed by the idempotency key
 *   (`xp:<login>:<eventId>:<version>`), so an event already awarded is found by
 *   the same key it was written with;
 * - **avoid duplicate XP** — a duplicate key produces no transaction;
 * - **avoid duplicate achievements** — the earned set is checked before an
 *   achievement is written, and `unlockAchievement` reports the duplicate;
 * - **update newly observed activity** — only events not already in the ledger
 *   are scored and awarded.
 *
 * ## Why the engine is pure
 *
 * It takes events and the current stores, and returns the next state plus what
 * changed. It does not fetch, does not persist and does not read a clock — those
 * belong to the caller. That is what makes 11.3 testable as a statement rather
 * than as an integration: "running this twice writes the second time nothing" is
 * a property of a function, and a property is what a test can hold it to.
 *
 * ## What "existing" means, precisely
 *
 * An event is existing when a transaction already exists for its idempotency key.
 * It is deliberately *not* "the event id appears in the feed": the same event can
 * be re-observed with a different scoring version, and the version is part of the
 * key, so a re-score under v2 is correctly a new transaction (SCORING.md §3 —
 * history is not rewritten). Keying on the event id alone would silently suppress
 * a legitimate new award.
 */
import type { DeveloperEvent } from "../developer-event";
import { scoreEvents } from "../scoring/engine";
import { SCORING_V1, type ScoringVersion } from "../scoring/types";
import { ledgerEntriesFor, type LedgerEntry } from "../scoring/ledger";
import {
  evaluateAllAchievements,
  type AchievementProgress,
} from "../achievements/eligibility";
import {
  unlockAchievement,
  type AchievementUnlock,
} from "../achievements/unlock";
import type { AchievementDefinition } from "../achievements/definition";
import type { SyncCounters } from "./job";

/** Everything the engine reads before it decides. */
export interface SyncState {
  /** Idempotency keys already written (TASKS 5.11). */
  readonly awardedKeys: ReadonlySet<string>;
  /** Achievement ids already earned by this developer. */
  readonly earnedAchievementIds: ReadonlySet<string>;
}

/** What a run produced. */
export interface SyncOutcome {
  /** Transactions this run wrote. Empty when everything was a duplicate. */
  readonly transactions: readonly LedgerEntry[];
  /** Achievement unlocks this run wrote. */
  readonly achievementUnlocks: readonly AchievementUnlock[];
  /** The idempotency keys after the run, for the caller to persist. */
  readonly awardedKeys: readonly string[];
  /** The earned achievement ids after the run. */
  readonly earnedAchievementIds: readonly string[];
  /** What the run did, for the job record. */
  readonly counters: SyncCounters;
  /** Every achievement's standing, earned or not, for the UI. */
  readonly achievementProgress: readonly AchievementProgress[];
}

/**
 * Runs one synchronization pass.
 *
 * Deterministic: the same events and state produce the same outcome, which is
 * what lets 11.3 be asserted directly and what makes a retry safe.
 */
export function synchronize(input: {
  readonly developerLogin: string;
  readonly events: readonly DeveloperEvent[];
  readonly state: SyncState;
  readonly achievements: readonly AchievementDefinition[];
  /** When the run's awards are recorded, ISO-8601. Caller-owned. */
  readonly at: string;
  /** Defaults to the current version. */
  readonly version?: ScoringVersion;
}): SyncOutcome {
  const version = input.version ?? SCORING_V1;

  // Key events by their idempotency key. A batch can contain an event twice
  // (dedupe happens upstream, but the engine must not depend on that), so the
  // first occurrence wins and the rest are duplicates.
  const results = scoreEvents(input.events, version);

  const newResults = [];
  let duplicateCount = 0;
  const seenThisRun = new Set<string>();

  for (const result of results) {
    if (!result.eligible) continue;

    const key = keyFor(result, input.developerLogin, input.events);
    if (key === null) continue;

    if (input.state.awardedKeys.has(key) || seenThisRun.has(key)) {
      duplicateCount += 1;
      continue;
    }

    seenThisRun.add(key);
    newResults.push(result);
  }

  const newEventIds = new Set(newResults.map((result) => result.eventId));
  const newEvents = input.events.filter((event) => newEventIds.has(event.id));
  const transactions = ledgerEntriesFor(newResults, newEvents, input.at);

  const awardedKeys = [
    ...input.state.awardedKeys,
    ...transactions.map((transaction) => transaction.id),
  ];

  // Achievements are evaluated against the *whole* event history, not only this
  // run's events: an achievement met across two syncs must be awarded by the
  // second. The earned set prevents a re-award.
  const achievementProgress = evaluateAllAchievements(input.achievements, input.events);
  const achievementUnlocks: AchievementUnlock[] = [];
  const earned = new Set(input.state.earnedAchievementIds);

  for (const definition of input.achievements) {
    if (earned.has(definition.id)) continue;

    const progress = achievementProgress.find((p) => p.achievementId === definition.id);
    if (progress === undefined || !progress.met) continue;

    const result = unlockAchievement(
      {
        progress,
        developerLogin: input.developerLogin,
        scoringVersionId: version.id,
        unlockedAt: input.at,
      },
      earned,
      definition,
      input.events,
    );

    if (!result.duplicate) {
      achievementUnlocks.push(result.unlock);
      earned.add(definition.id);
    }
  }

  const xpAwarded = transactions.reduce((sum, transaction) => sum + transaction.xp, 0);

  return {
    transactions,
    achievementUnlocks,
    awardedKeys,
    earnedAchievementIds: [...earned],
    counters: {
      eventsObserved: input.events.length,
      eventsNew: transactions.length,
      eventsDuplicate: duplicateCount,
      xpAwarded,
      transactionsWritten: transactions.length,
      achievementsUnlocked: achievementUnlocks.length,
    },
    achievementProgress,
  };
}

/**
 * The idempotency key for a result, or null when its event cannot be found.
 *
 * The key is reconstructed from the same fields `ledgerEntryFor` uses rather than
 * read off a transaction, so the duplicate check can run before any transaction
 * is built — which is what lets a fully-duplicate run produce no records at all.
 */
function keyFor(
  result: { eventId: string; scoringVersion: string },
  developerLogin: string,
  events: readonly DeveloperEvent[],
): string | null {
  if (!events.some((event) => event.id === result.eventId)) return null;
  return `xp:${developerLogin}:${result.eventId}:${result.scoringVersion}`;
}