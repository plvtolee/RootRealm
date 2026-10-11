/**
 * RootRealm — the achievement screen's view model (TASKS 7.4).
 *
 * ```text
 * ACHIEVEMENT_DEFINITIONS + events + earnedIds → AchievementViewState (for the UI)
 * ```
 *
 * TASKS 7.4 replaces the mock achievements with real progression state, and the
 * same constraint as 6.6 applies: the screen consumes domain state and does not
 * derive eligibility itself. This module is that bridge. It is pure, so the same
 * inputs always produce the same view.
 *
 * Presentation (icon, rarity styling, copy layout) is not here. It lives with the
 * screen.
 */

import type { DeveloperEvent } from "../developer-event";
import { ACHIEVEMENT_DEFINITIONS, type AchievementDefinition, type AchievementRarity } from "./definition";
import { evaluateAchievement, type AchievementProgress } from "./eligibility";

/** One achievement as the screen renders it. */
export interface AchievementView {
  readonly definition: AchievementDefinition;
  readonly progress: AchievementProgress;
  /** Held by the developer. Recorded, not re-derived, so a past award stands. */
  readonly earned: boolean;
}

/** Counts of achievements per rarity. */
export type RarityCounts = Readonly<Record<AchievementRarity, number>>;

/** The whole achievement screen's state for one developer. */
export interface AchievementViewState {
  readonly achievements: readonly AchievementView[];
  readonly earnedCount: number;
  readonly totalCount: number;
  /** Counts over the whole catalog, for the rarity filter chips. */
  readonly rarityCounts: RarityCounts;
}

/**
 * Derives the achievement screen's state.
 *
 * `earnedIds` is the store of recorded unlocks (7.3). An achievement counts as
 * earned when it is recorded, not when the current events happen to satisfy it,
 * so a past award is not revoked by a later change in the evidence.
 */
export function computeAchievementView(
  events: readonly DeveloperEvent[],
  earnedIds: ReadonlySet<string>,
  definitions: readonly AchievementDefinition[] = ACHIEVEMENT_DEFINITIONS,
): AchievementViewState {
  const achievements: AchievementView[] = definitions.map((definition) => ({
    definition,
    progress: evaluateAchievement(definition, events),
    earned: earnedIds.has(definition.id),
  }));

  const rarityCounts: Record<AchievementRarity, number> = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };
  for (const { definition } of achievements) {
    rarityCounts[definition.rarity] += 1;
  }

  return {
    achievements,
    earnedCount: achievements.filter((view) => view.earned).length,
    totalCount: achievements.length,
    rarityCounts,
  };
}
