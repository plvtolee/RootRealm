/**
 * RootRealm — the scoring engine (TASKS 5.10 groundwork, `SCORING.md` §33).
 *
 * ```text
 * DeveloperEvent[] → ScoreResult[]
 * ```
 *
 * §33 specifies the pure interfaces the engine must expose:
 *
 * ```ts
 * scoreEvent(event, scoringVersion): ScoreResult
 * scoreEvents(events, scoringVersion): ScoreResult[]
 * ```
 *
 * This module is both, plus the rule registry that makes dispatch explicit.
 *
 * ## Dispatch is first-match, and says so when nothing matches
 *
 * Exactly one rule handles any given kind today, and the kinds are disjoint, so
 * ordering carries no weight. The ordering-independence is what matters rather
 * than the ordering: if two rules ever claim one kind, first-match is a real
 * decision that would need to be made deliberately, and a test pins the current
 * behaviour so it cannot be reached by accident.
 *
 * A kind no rule handles yields an ineligible result carrying §35's
 * `unsupported_event`. That is deliberate: an event that scores nothing should
 * still be *explainable*, and a silent skip would make a scoring run impossible
 * to reconcile against the events it was given.
 *
 * ## What this module deliberately does not do
 *
 * It does not deduplicate or check whether an event was already awarded. Those
 * are §18 idempotency (TASKS 5.11) and `SCORING.md` §5 eligibility rule 5, both
 * of which need state this module does not have. `scoreEvents` is pure by design
 * so those concerns can wrap it rather than live inside it.
 */
import type { DeveloperEvent } from "../developer-event";
import { documentationRule } from "./rules/documentation";
import { issueRule } from "./rules/issue";
import { pullRequestRule } from "./rules/pull-request";
import { pushRule } from "./rules/push";
import { releaseRule } from "./rules/release";
import { reviewRule } from "./rules/review";
import type { ScoringRule } from "./rule";
import { ineligibleResult, type ScoreResult, type ScoringVersion } from "./types";

/**
 * Every scoring rule, in dispatch order.
 *
 * Explicit rather than discovered by convention: a rule that exists but is not
 * registered here awards nothing, and a registry makes that a visible omission
 * rather than a surprise. Registration is also where an ordering decision would
 * be made, were one ever needed.
 */
export const RULES: readonly ScoringRule[] = [
  pushRule,
  pullRequestRule,
  reviewRule,
  issueRule,
  releaseRule,
  documentationRule,
];

/** Scores one event, or explains that no rule handles it (§35). */
export function scoreEvent(
  event: DeveloperEvent,
  version: ScoringVersion,
): ScoreResult {
  for (const rule of RULES) {
    const result = rule.evaluate(event, version);
    if (result !== null) return result;
  }

  return ineligibleResult(
    event.id,
    version.id,
    "No scoring rule handles this event.",
    "unsupported_event",
  );
}

/** Scores a batch, preserving order (§33). */
export function scoreEvents(
  events: readonly DeveloperEvent[],
  version: ScoringVersion,
): ScoreResult[] {
  return events.map((event) => scoreEvent(event, version));
}

/** A scoring run's totals, for reports and for reconciliation checks. */
export interface ScoringSummary {
  /** Events scored, eligible or not. */
  scored: number;
  eligible: number;
  rejected: number;
  totalXp: number;
  /** Attribute units awarded, for every attribute including the empty ones. */
  attributeTotals: Record<string, number>;
  rejections: Record<string, number>;
}

/**
 * Summarises a scoring run.
 *
 * Every attribute and every rejection reason is represented, even at zero,
 * because "this developer earned no Scholar progress" is a different statement
 * from "Scholar was never considered" — and the second is what an omitted key
 * looks like.
 */
export function summarize(results: readonly ScoreResult[]): ScoringSummary {
  const attributeTotals: Record<string, number> = {};
  const rejections: Record<string, number> = {};

  let totalXp = 0;
  let eligible = 0;

  for (const result of results) {
    if (result.eligible) {
      eligible += 1;
      totalXp += result.xp;
    } else if (result.rejectionReason !== undefined) {
      rejections[result.rejectionReason] =
        (rejections[result.rejectionReason] ?? 0) + 1;
    }

    for (const award of result.attributeAwards) {
      attributeTotals[award.attribute] =
        (attributeTotals[award.attribute] ?? 0) + award.amount;
    }
  }

  return {
    scored: results.length,
    eligible,
    rejected: results.length - eligible,
    totalXp,
    attributeTotals,
    rejections,
  };
}
