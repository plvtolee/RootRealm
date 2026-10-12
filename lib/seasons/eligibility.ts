/**
 * RootRealm — leaderboard eligibility (TASKS 16.4).
 *
 * ```text
 * a season's published rules + a developer's evidence → eligible, or a named reason
 * ```
 *
 * TASKS 16.4 says "publish and enforce eligibility rules", and the two halves pull
 * in opposite directions. *Publishing* means a developer can read what the bar is
 * before competing for it; *enforcing* means the bar is actually applied. This
 * module does both from one object: the season carries the rule
 * (`eligibility.minimumEvidence`), the view prints it, and the check refuses a
 * developer who has not met it.
 *
 * ## Why the bar is a count and not a score
 *
 * The minimum is an `EvidenceRequirement`, the same union skills and achievements
 * count (TASKS 6.1). A total-XP threshold would rank history rather than current
 * participation and would put a long-career developer permanently ahead of
 * someone in their first season — the opposite of what a season is for.
 *
 * ## Why every refusal is named
 *
 * A ladder that silently omits someone cannot be argued with. Each refusal carries
 * the requirement it failed and the count it reached, so the UI can say "5 merges
 * required, 2 counted" rather than showing nothing.
 */
import type { DeveloperEvent } from "../developer-event";
import { evaluateRequirement } from "../skills/evidence";

import { type Season } from "./definition";

/** Why a developer is not eligible for a season's ladder. */
export type IneligibilityReason =
  /** The season's evidence minimum is not met. */
  | "evidence_minimum_not_met"
  /** The developer has not opted in (TASKS 16.2). */
  | "no_consent"
  /** A safeguard rejected the standing (TASKS 16.5). */
  | "safeguard_failed";

/** One reason, with the numbers behind it. */
export interface Ineligibility {
  readonly reason: IneligibilityReason;
  /** What the season required, for the message. */
  readonly required: number;
  /** What the developer has, when it is a count. */
  readonly counted: number;
  /** A sentence the screen can show without inventing its own wording. */
  readonly detail: string;
}

/** Whether a developer may appear on a season's ladder. */
export type Eligibility =
  | { readonly eligible: true; readonly season: Season }
  | { readonly eligible: false; readonly season: Season; readonly ineligibility: Ineligibility };

/** The minimum a season publishes, counted over a developer's events. */
export interface EvidenceCheck {
  readonly required: number;
  readonly counted: number;
  readonly met: boolean;
}

/**
 * Whether a developer meets a season's evidence minimum.
 *
 * Counted over the whole observed history rather than the season's window on
 * purpose: the minimum exists to keep one-event ladders off the board, not to
 * measure this season's participation — which is what the points measure.
 */
export function evidenceCheck(season: Season, events: readonly DeveloperEvent[]): EvidenceCheck {
  const required = season.eligibility.minimumEvidence.count;
  const counted = evaluateRequirement(season.eligibility.minimumEvidence, events);
  return { required, counted, met: counted >= required };
}

/**
 * Whether a developer may be ranked in the season containing `at`.
 *
 * `participating` is the opt-in answer (TASKS 16.2) and `safeguardsPass` is the
 * anti-farming answer (TASKS 16.5), both passed in rather than recomputed here:
 * eligibility asks, it does not re-derive. A caller that wants a standing
 * published has to have asked those two questions and can say so.
 */
export function eligibilityFor(input: {
  readonly season: Season;
  readonly developerLogin: string;
  readonly events: readonly DeveloperEvent[];
  readonly participating: boolean;
  readonly safeguardsPass: boolean;
}): Eligibility {
  const { season } = input;

  if (!input.participating) {
    return {
      eligible: false,
      season,
      ineligibility: {
        reason: "no_consent",
        required: 0,
        counted: 0,
        detail: "This developer has not opted in to the season's leaderboard.",
      },
    };
  }

  if (!input.safeguardsPass) {
    return {
      eligible: false,
      season,
      ineligibility: {
        reason: "safeguard_failed",
        required: 0,
        counted: 0,
        detail: "This standing was withheld by an anti-farming safeguard.",
      },
    };
  }

  const evidence = evidenceCheck(season, input.events);
  if (!evidence.met) {
    return {
      eligible: false,
      season,
      ineligibility: {
        reason: "evidence_minimum_not_met",
        required: evidence.required,
        counted: evidence.counted,
        detail: `${evidence.counted} of ${evidence.required} qualifying merges observed.`,
      },
    };
  }

  return { eligible: true, season };
}

/**
 * The eligibility rules as the leaderboard publishes them.
 *
 * Published even to developers who are not eligible: SCORING.md §30 requires a
 * transparent ladder, and a rule nobody can read is not transparent.
 */
export interface PublishedRules {
  readonly seasonId: string;
  readonly seasonName: string;
  readonly minimumEvidence: string;
  readonly requiresOptIn: boolean;
  readonly points: readonly { readonly kind: string; readonly points: number }[];
}

const EVIDENCE_LABEL: Readonly<Record<string, string>> = {
  merged_pull_requests: "qualifying merged pull requests",
  completed_reviews: "completed reviews",
  published_releases: "published releases",
  qualifying_documentation: "documentation pages",
  landed_pushes: "landed pushes",
  verified_regression_tests: "verified regression tests",
};

export function publishedRules(season: Season): PublishedRules {
  const requirement = season.eligibility.minimumEvidence;
  const label = EVIDENCE_LABEL[requirement.kind] ?? requirement.kind;

  return {
    seasonId: season.id,
    seasonName: season.name,
    minimumEvidence: `${requirement.count} ${label}`,
    requiresOptIn: season.eligibility.requiresOptIn,
    points: Object.entries(season.points).map(([kind, points]) => ({ kind, points })),
  };
}