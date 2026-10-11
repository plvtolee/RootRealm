/**
 * RootRealm — achievement definitions (TASKS 7.1).
 *
 * ```text
 * data contract → typed AchievementDefinition[]
 * ```
 *
 * `SCORING.md` §27 is the governing text: achievements "should not simply mirror
 * XP totals", and "the achievement system owns its own criteria". So an
 * achievement is defined by the evidence it requires, not by a point threshold.
 *
 * ## Why the criterion reuses `EvidenceRequirement`
 *
 * Skills (TASKS 6.1) already define countable evidence as a union of
 * measurements. An achievement such as "First Merge" is the same measurement at a
 * different threshold, so it reuses that union rather than inventing a second
 * vocabulary. The counting code in `lib/skills/evidence.ts` then serves both, and
 * an achievement can never disagree with a skill about what a merged pull request
 * is.
 *
 * ## Why rarity is a field, and what it does not do
 *
 * `rarity` is one of the contract's four values (`DATA_CONTRACT.md` §18):
 * `common | rare | epic | legendary`. It is descriptive metadata for display and
 * for the reveal's restraint (TASKS 3.4: common achievements must not look like
 * major unlocks). It does not grant anything, and it does not affect eligibility.
 *
 * ## What this module does not contain
 *
 * - No unlock state. Whether a developer holds an achievement is 7.2 and 7.3.
 * - No visuals, icon or copy beyond `title` and `description`. Presentation lives
 *   with the achievements screen (TASKS 7.4), as it does for skills.
 * - No rewards. CodeCoins and XP grants are a later phase's decision.
 */

import type { EvidenceRequirement } from "../skills/definition";

/** Rarity, `DATA_CONTRACT.md` §18. Display metadata only. */
export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export interface AchievementDefinition {
  /** Stable identifier. Unlock records reference this, so renaming orphans history. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly rarity: AchievementRarity;
  /**
   * The evidence that earns it. Achievements are satisfied when the developer's
   * event history meets this requirement, never from a points total.
   */
  readonly criterion: EvidenceRequirement;
}

/**
 * The initial catalog, from TASKS 7.1 and the examples in `SCORING.md` §27.
 *
 * Contribution milestones are split into three thresholds of the same
 * measurement, so each is a distinct, separately unlockable achievement with its
 * own rarity. The thresholds are starting values, to be tuned against real data.
 */
export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    id: "first-merge",
    title: "First Merge",
    description: "Have at least one qualifying pull request merged.",
    rarity: "common",
    criterion: { kind: "merged_pull_requests", count: 1 },
  },
  {
    id: "first-release",
    title: "First Release",
    description: "Publish at least one qualifying release.",
    rarity: "common",
    criterion: { kind: "published_releases", count: 1 },
  },
  {
    id: "reviewer",
    title: "Reviewer",
    description: "Complete at least one review.",
    rarity: "common",
    criterion: { kind: "completed_reviews", count: 1 },
  },
  {
    id: "documentation-milestone",
    title: "Documentation Milestone",
    description: "Create a page of qualifying documentation.",
    rarity: "common",
    criterion: { kind: "qualifying_documentation", count: 1 },
  },
  {
    id: "contribution-10",
    title: "Ten Merges",
    description: "Have ten qualifying pull requests merged.",
    rarity: "rare",
    criterion: { kind: "merged_pull_requests", count: 10 },
  },
  {
    id: "contribution-50",
    title: "Fifty Merges",
    description: "Have fifty qualifying pull requests merged.",
    rarity: "epic",
    criterion: { kind: "merged_pull_requests", count: 50 },
  },
  {
    id: "contribution-100",
    title: "One Hundred Merges",
    description: "Have one hundred qualifying pull requests merged.",
    rarity: "legendary",
    criterion: { kind: "merged_pull_requests", count: 100 },
  },
];

/** Looks up an achievement by id. Returns `undefined` for an unknown id. */
export function indexAchievements(
  definitions: readonly AchievementDefinition[],
): ReadonlyMap<string, AchievementDefinition> {
  return new Map(definitions.map((definition) => [definition.id, definition]));
}
