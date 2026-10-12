/**
 * RootRealm — anti-farming safeguards (TASKS 16.5).
 *
 * ```text
 * a season's counted activity → passed, or the named checks that rejected it
 * ```
 *
 * TASKS 16.5 says to implement initial safeguards and, just as importantly, "do
 * not build unnecessarily complex heuristics before actual abuse patterns exist".
 * That instruction is taken literally, and it is the reason this module is small.
 * Every check here satisfies three properties:
 *
 * 1. **it can be stated in one sentence** — "a season's points must come from at
 *    least N different days" is a rule a developer can read and agree with;
 * 2. **it is decidable from the evidence alone** — no reputation score, no
 *    cross-developer comparison, nothing that changes when someone else plays;
 * 3. **it fails loudly** — a withheld standing names its check, so the refusal is
 *    arguable rather than mysterious.
 *
 * Coordinated-abuse detection, velocity analysis across accounts, and anything
 * that needs a judgement call are deliberately absent. They would be guesses about
 * abuse that has not happened, and a wrong guess here reads as a verdict on a real
 * developer.
 *
 * ## What makes farming structurally hard already
 *
 * Four of the protections are not checks but shapes, and they are why the checks
 * above are few:
 *
 * - points are **recomputed** from canonical events, never accumulated, so a
 *   re-ingested event cannot be counted twice (TASKS 11.3);
 * - the counted set is **deduplicated by event id**;
 * - only events **inside the season window** are counted;
 * - ranking is **opt-in** (TASKS 16.2), so the stake being gamed is a season's
 *   own ladder, not a permanent score.
 */
import type { DeveloperEvent } from "../developer-event";

import type { Season } from "./definition";

/** The safeguards in force. Versioned, like every other policy in RootRealm. */
export interface SafeguardRules {
  readonly id: string;
  /**
   * Minimum distinct UTC days with counted activity.
   *
   * The rule against a burst: one afternoon of fifty merges cannot take a season.
   */
  readonly minimumActiveDays: number;
  /**
   * The largest share of a developer's points one repository may supply, 0–1.
   *
   * A repository is where a developer legitimately does all their work, so this
   * is a high ceiling that only trips a standing resting on a single project —
   * which is the shape a manufactured one takes.
   */
  readonly maxSingleRepositoryShare: number;
}

export const SAFEGUARDS_V1: SafeguardRules = {
  id: "safeguards-v1",
  minimumActiveDays: 3,
  maxSingleRepositoryShare: 0.6,
};

/** One safeguard's verdict. */
export interface SafeguardCheck {
  readonly rule: "burst_activity" | "single_repository" | "future_dated" | "duplicate_evidence";
  readonly passed: boolean;
  /** A sentence for the screen or an operator. */
  readonly detail: string;
}

/** The overall verdict. */
export type SafeguardVerdict =
  | { readonly passed: true; readonly checks: readonly SafeguardCheck[] }
  | { readonly passed: false; readonly checks: readonly SafeguardCheck[] };

/** One counted event, as the safeguards see it. */
export interface CountedActivity {
  readonly eventId: string;
  /** UTC day, `YYYY-MM-DD`. */
  readonly day: string;
  /** `UNATTRIBUTED_REPOSITORY` when the event named no repository. */
  readonly repositoryId: number;
  /** The points this event contributed. */
  readonly points: number;
}

/** The bucket for activity that named no repository. Never a real GitHub id. */
export const UNATTRIBUTED_REPOSITORY = 0;

/**
 * The activity a standing rests on: events inside the season that the season pays
 * for, deduplicated by event id.
 *
 * Built once here so every check reasons over the same set. A check that counted
 * events differently from another check would be a disagreement waiting to
 * happen.
 */
export function countedActivity(
  events: readonly DeveloperEvent[],
  season: Season,
  pointFor: (event: DeveloperEvent) => number,
): readonly CountedActivity[] {
  const starts = Date.parse(season.startsAt);
  const ends = Date.parse(season.endsAt);
  const seen = new Set<string>();
  const counted: CountedActivity[] = [];

  for (const event of events) {
    if (seen.has(event.id)) continue;

    const occurred = event.occurredAt === null ? NaN : Date.parse(event.occurredAt);
    if (Number.isNaN(occurred)) continue;

    const points = pointFor(event);
    if (points <= 0) continue;

    if (occurred < starts || occurred >= ends) continue;

    seen.add(event.id);
    counted.push({
      eventId: event.id,
      day: new Date(occurred).toISOString().slice(0, 10),
      // An event with no repository cannot be attributed, so it forms its own
      // bucket rather than being dropped: losing the points would let a standing
      // be laundered by withholding a repository.
      repositoryId: event.repositoryId ?? UNATTRIBUTED_REPOSITORY,
      points,
    });
  }

  return counted;
}

/**
 * Runs every safeguard over one standing.
 *
 * All checks run even after one fails, so a developer who trips two rules is told
 * both — a single opaque refusal is the kind of thing that reads as arbitrary.
 */
export function runSafeguards(
  activity: readonly CountedActivity[],
  at: Date,
  rules: SafeguardRules = SAFEGUARDS_V1,
): SafeguardVerdict {
  const totalPoints = activity.reduce((sum, entry) => sum + entry.points, 0);
  const checks: SafeguardCheck[] = [];

  const days = new Set(activity.map((entry) => entry.day));
  checks.push({
    rule: "burst_activity",
    passed: days.size >= rules.minimumActiveDays,
    detail:
      days.size >= rules.minimumActiveDays
        ? `${days.size} distinct days of activity.`
        : `${days.size} distinct days of activity; ${rules.minimumActiveDays} required.`,
  });

  const byRepository = new Map<number, number>();
  for (const entry of activity) {
    byRepository.set(entry.repositoryId, (byRepository.get(entry.repositoryId) ?? 0) + entry.points);
  }
  const ranked = [...byRepository.entries()].sort((a, b) => b[1] - a[1]);
  const topRepository = ranked[0]?.[0] ?? null;
  const topPoints = ranked[0]?.[1] ?? 0;
  const share = totalPoints === 0 ? 0 : topPoints / totalPoints;
  checks.push({
    rule: "single_repository",
    passed: share <= rules.maxSingleRepositoryShare,
    detail:
      topRepository === null
        ? "No counted activity."
        : `Repository ${topRepository} supplied ${Math.round(share * 100)}% of the points; ${Math.round(rules.maxSingleRepositoryShare * 100)}% allowed.`,
  });

  const future = activity.filter((entry) => Date.parse(`${entry.day}T23:59:59.999Z`) > at.getTime());
  checks.push({
    rule: "future_dated",
    passed: future.length === 0,
    detail:
      future.length === 0
        ? "No activity dated after this standing was computed."
        : `${future.length} counted events are dated after the computation.`,
  });

  checks.push({
    rule: "duplicate_evidence",
    passed: new Set(activity.map((entry) => entry.eventId)).size === activity.length,
    detail: "Each counted event appears once.",
  });

  return { passed: checks.every((check) => check.passed), checks };
}

/** The safeguards as published, so the rules are readable before competing. */
export interface PublishedSafeguards {
  readonly id: string;
  readonly statements: readonly string[];
}

export function publishedSafeguards(rules: SafeguardRules = SAFEGUARDS_V1): PublishedSafeguards {
  return {
    id: rules.id,
    statements: [
      `A standing needs counted activity on at least ${rules.minimumActiveDays} different UTC days.`,
      `One repository may supply at most ${Math.round(rules.maxSingleRepositoryShare * 100)}% of a standing's points.`,
      "Activity dated after a standing was computed does not count toward it.",
      "Repeated observations of one event count once.",
    ],
  };
}