/**
 * RootRealm — achievement unlock records (TASKS 7.3).
 *
 * ```text
 * eligibility (7.2) + store → AchievementUnlock records, idempotently
 * ```
 *
 * TASKS 7.3 asks for two things: persisted unlock records, and evidence
 * references. The shape follows the skill unlocks (TASKS 6.5) for the same
 * reasons: one record per (developer, achievement), so a duplicate is a structural
 * no-op rather than a row to reconcile.
 *
 * ## Evidence references
 *
 * An unlock records the event ids that satisfied it, so the award can be
 * explained later (SCORING.md A17, the explanation ledger). Only the events
 * actually counted are referenced. An achievement met by 10 merges references
 * those 10, not the developer's whole history.
 *
 * ## Unlocking is a decision, not an action
 *
 * `unlockAchievement` refuses an achievement the evidence does not meet. The
 * caller cannot award one by asking, the same gate as skills.
 */

import type { DeveloperEvent } from "../developer-event";
import { contributesTo, evaluateRequirement } from "../skills/evidence";
import type { AchievementDefinition } from "./definition";
import type { AchievementProgress } from "./eligibility";

/** One achievement earned by one developer. */
export interface AchievementUnlock {
  /** The developer it belongs to. Required, never defaulted from a session. */
  readonly developerLogin: string;
  /** The earned achievement. `AchievementDefinition.id`. */
  readonly achievementId: string;
  /** When it was recorded, ISO-8601. Supplied by the caller for determinism. */
  readonly unlockedAt: string;
  /** The scoring version the evidence was drawn from (SCORING.md A3). */
  readonly scoringVersionId: string;
  /** The event ids that satisfied the criterion, for explanation. */
  readonly evidenceEventIds: readonly string[];
}

/** The result of attempting an unlock. */
export interface AchievementUnlockResult {
  readonly unlock: AchievementUnlock;
  /** True when already earned, so no new record was written. */
  readonly duplicate: boolean;
  /** The store after the attempt. */
  readonly earnedIds: readonly string[];
}

/** Everything `unlockAchievement` needs to decide. */
export interface AchievementUnlockInput {
  readonly progress: AchievementProgress;
  readonly developerLogin: string;
  readonly scoringVersionId: string;
  readonly unlockedAt: string;
}

/** All earned achievement ids for one developer. */
export type AchievementStore = ReadonlySet<string>;

/**
 * Awards an achievement, or reports that it was already held.
 *
 * Refuses one the evidence does not meet. Throws, rather than returning a flag,
 * because awarding an unmet achievement is a programming error, not a state the
 * UI should reach.
 */
export function unlockAchievement(
  input: AchievementUnlockInput,
  earned: AchievementStore,
  definition: AchievementDefinition,
  events: readonly DeveloperEvent[],
): AchievementUnlockResult {
  const { progress } = input;

  if (progress.achievementId !== definition.id) {
    throw new Error(
      `Progress for ${progress.achievementId} cannot award ${definition.id}; ` +
        `the record must describe the achievement it was earned for.`,
    );
  }

  const evidenceEventIds = referencedEvents(definition, events);
  const unlock: AchievementUnlock = {
    developerLogin: input.developerLogin,
    achievementId: definition.id,
    unlockedAt: input.unlockedAt,
    scoringVersionId: input.scoringVersionId,
    evidenceEventIds,
  };

  if (earned.has(definition.id)) {
    return { unlock, duplicate: true, earnedIds: [...earned] };
  }

  if (!progress.met) {
    throw new Error(
      `Cannot award ${definition.id}: ${progress.current} of ${progress.required} ` +
        `evidence counted, not met.`,
    );
  }

  return {
    unlock,
    duplicate: false,
    earnedIds: [...earned, definition.id],
  };
}

/**
 * The events an achievement's criterion counted.
 *
 * Re-derives the referenced set from the criterion, rather than trusting a cache,
 * so the references always match the rule. A requirement kind with no per-event
 * reference (an attribute-units count) returns no ids, which is recorded as an
 * empty list rather than invented.
 */
function referencedEvents(
  definition: AchievementDefinition,
  events: readonly DeveloperEvent[],
): readonly string[] {
  const count = evaluateRequirement(definition.criterion, events);
  if (count === 0) return [];

  const matching = events.filter((event) => contributesTo(definition.criterion, event));
  return matching.slice(0, definition.criterion.count).map((event) => event.id);
}

/**
 * Whether a developer holds an achievement. The duplicate check, exposed for any
 * caller that needs the answer without an unlock attempt.
 */
export function isAchievementEarned(achievementId: string, earned: AchievementStore): boolean {
  return earned.has(achievementId);
}
