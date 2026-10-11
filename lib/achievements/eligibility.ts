/**
 * RootRealm — achievement eligibility (TASKS 7.2).
 *
 * ```text
 * AchievementDefinition + DeveloperEvent[] → AchievementProgress (deterministic)
 * ```
 *
 * "Implement deterministic achievement criteria" means the same events always
 * produce the same answer, with no clock, randomness or stored state read here.
 *
 * Counting is delegated to `evaluateRequirement` in `lib/skills/evidence.ts`. An
 * achievement and a skill that both ask for "merged pull requests" therefore
 * cannot disagree about the number. The only thing this module adds is the
 * threshold comparison and the progress report.
 */

import type { DeveloperEvent } from "../developer-event";
import { evaluateRequirement } from "../skills/evidence";
import type { AchievementDefinition } from "./definition";

/** One achievement's standing for one developer. */
export interface AchievementProgress {
  readonly achievementId: string;
  /** Evidence counted so far. */
  readonly current: number;
  /** Evidence required to earn it. */
  readonly required: number;
  /** True once `current` reaches `required`. */
  readonly met: boolean;
}

/**
 * Evaluates one achievement against the developer's events.
 *
 * Progress is clamped to `required`, so a developer with 120 merges shows 10 of
 * 10 for a ten-merge achievement rather than an impossible overshoot. `met` is
 * computed from the unclamped count, so it stays correct at the boundary.
 */
export function evaluateAchievement(
  definition: AchievementDefinition,
  events: readonly DeveloperEvent[],
): AchievementProgress {
  const counted = evaluateRequirement(definition.criterion, events);
  const required = definition.criterion.count;

  return {
    achievementId: definition.id,
    current: Math.min(counted, required),
    required,
    met: counted >= required,
  };
}

/** Evaluates every achievement in the catalog, in catalog order. */
export function evaluateAllAchievements(
  definitions: readonly AchievementDefinition[],
  events: readonly DeveloperEvent[],
): readonly AchievementProgress[] {
  return definitions.map((definition) => evaluateAchievement(definition, events));
}
