/**
 * RootRealm — profile aggregation (TASKS 8.1).
 *
 * ```text
 * character + events + unlocks → AggregatedProfile (for the profile screen)
 * ```
 *
 * TASKS 8.1 asks for one profile service that combines character, XP,
 * attributes, achievements, featured repository, cosmetics and quest state.
 * Four of those are real domain modules today (scoring, attributes, levels,
 * achievements); cosmetics and quests are later phases and do not exist yet.
 *
 * This module is the one place that composes them, so no screen has to call the
 * scoring engine, the level curve and the achievement catalog in the right order
 * itself. It is pure: the same inputs always produce the same profile.
 *
 * ## Missing pieces are named, not faked
 *
 * `cosmetics` and `questState` are `null` here, with the reason recorded. The
 * Phase 2 mock filled every slot with invented values so the screen could be
 * built; a real profile must not, because a fabricated equipped frame or quest
 * goal is indistinguishable from a real one at the type level. A later phase
 * (13, 12) replaces `null` with the real shape, and the screen already renders
 * the empty state.
 */

import type { DeveloperEvent } from "../developer-event";
import type { AttributeKey } from "../attributes";
import { SCORING_V1 } from "../scoring/types";
import { levelProgress, type LevelProgress } from "../scoring/levels";
import { scoreEvents, summarize } from "../scoring/engine";
import { computeAchievementView, type AchievementViewState } from "../achievements/view";
import type { PublicProfile } from "../github/profile";

/** The identity block of the profile. */
export interface ProfileCharacter {
  /** GitHub login. The stable key the rest of the profile hangs from. */
  readonly login: string;
  /** Display name, or the login when GitHub has none. */
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
  readonly location: string | null;
  /**
   * Whether ownership of the GitHub identity is verified (PRD §8).
   *
   * False here: verification is the OAuth phase (9.1), and a profile built from
   * a public lookup has not been verified. Naming it false is the honest default;
   * the screen shows the unverified state.
   */
  readonly verified: boolean;
}

/** XP and level, from the scoring engine and the level curve. */
export interface ProfileProgression {
  readonly totalXp: number;
  readonly level: LevelProgress;
}

/** The six attributes, in contract order, with the units the engine awarded. */
export type ProfileAttributes = Readonly<Record<AttributeKey, number>>;

/** What the profile screen renders, combined. */
export interface AggregatedProfile {
  readonly character: ProfileCharacter;
  readonly progression: ProfileProgression;
  readonly attributes: ProfileAttributes;
  readonly achievements: AchievementViewState;
  /** Featured repository, or null when none was chosen or nothing was fetched. */
  readonly featuredRepository: FeaturedRepository | null;
  /** Equipped cosmetics. Null until TASKS 13.3 defines them. */
  readonly cosmetics: null;
  /** Active quest state. Null until TASKS 12.2 defines it. */
  readonly questState: null;
}

/** The featured repository block, from a fetched repository record. */
export interface FeaturedRepository {
  readonly fullName: string;
  readonly description: string | null;
  readonly url: string | null;
  readonly primaryLanguage: string | null;
  readonly stars: number | null;
}

/** Everything `aggregateProfile` needs. */
export interface ProfileInput {
  readonly login: string;
  /** The GitHub profile, when the lookup succeeded. */
  readonly profile?: PublicProfile | null;
  readonly events: readonly DeveloperEvent[];
  /** Recorded achievement unlocks (TASKS 7.3). */
  readonly earnedAchievementIds?: ReadonlySet<string>;
  /** The chosen featured repository, when one was fetched. */
  readonly featuredRepository?: FeaturedRepository | null;
}

const ATTRIBUTE_KEYS: readonly AttributeKey[] = [
  "builder",
  "debugger",
  "scholar",
  "collaborator",
  "maintainer",
  "architect",
];

/**
 * Combines the domain modules into one profile.
 *
 * The order mirrors the dependency graph: score the events once, summarise to
 * get XP and attribute totals, turn the total into a level, then evaluate
 * achievements from the same events.
 */
export function aggregateProfile(input: ProfileInput): AggregatedProfile {
  const results = scoreEvents(input.events, SCORING_V1);
  const summary = summarize(results);

  const attributes = emptyAttributes();
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = summary.attributeTotals[key] ?? 0;
  }

  return {
    character: {
      login: input.login,
      displayName: input.profile?.name?.trim() || input.login,
      avatarUrl: input.profile?.avatarUrl ?? null,
      bio: input.profile?.bio ?? null,
      location: input.profile?.location ?? null,
      verified: false,
    },
    progression: {
      totalXp: summary.totalXp,
      level: levelProgress(summary.totalXp, "curve-v1"),
    },
    attributes,
    achievements: computeAchievementView(input.events, input.earnedAchievementIds ?? new Set()),
    featuredRepository: input.featuredRepository ?? null,
    cosmetics: null,
    questState: null,
  };
}

/** The six attributes, all zero, so every key is always present. */
function emptyAttributes(): Record<AttributeKey, number> {
  return {
    builder: 0,
    debugger: 0,
    scholar: 0,
    collaborator: 0,
    maintainer: 0,
    architect: 0,
  };
}