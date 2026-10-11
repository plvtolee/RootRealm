/**
 * RootRealm — idempotent scoring (TASKS 5.11).
 *
 * ```text
 * ScoreResult[] + already-awarded keys → awards that should be recorded
 * ```
 *
 * TASKS 5.11: "Repeated processing of the same event must not award progression
 * twice." `SCORING.md` §18 puts the mechanism plainly: "The primary protection is
 * a stable event identity plus an idempotency key", and gives its shape
 * `xp:user123:event456:scoring-v1`.
 *
 * ## Why this is a filter, not a check inside scoring
 *
 * The rules are pure and stateless, which is what makes them testable and what
 * lets a scoring rule be re-run without consequence. Idempotency needs the
 * opposite — memory of what was already awarded — so it cannot live inside them.
 * It therefore wraps the run: score everything, then keep the awards whose keys
 * are new.
 *
 * A subtle and deliberate consequence follows. A *rejected* result is never a
 * duplicate, because it produced no award: an event that failed eligibility one
 * run and failed again the next has not been double-awarded. Filtering on
 * rejection reason instead of on the key would make every re-run look like a
 * duplicate, and would also mean an event that first failed eligibility and later
 * qualified — for instance after a confidence became verified — could never be
 * awarded.
 *
 * ## Why the version is part of the key
 *
 * §18 scopes it explicitly. A scoring change must be able to award an event again
 * without the award looking like a duplicate of the older scoring — that is the
 * entire point of versioning, and freezing the version out of the key would
 * couple the persistence layer to a constant it cannot move.
 */
import { idempotencyKey, type ScoringVersionId } from "./types";

/** One decision about whether an award should be recorded. */
export interface IdempotencyDecision {
  /** The event this decision is about. */
  eventId: string;
  /** The key that would identify the transaction (§18). */
  key: string;
  /** Whether recording it would be a duplicate. */
  duplicate: boolean;
}

export interface IdempotentScoringOptions {
  /** Keys already recorded, from a previous run or from storage. */
  alreadyAwarded?: Iterable<string>;
}

/**
 * Decides which of a batch of results should be recorded.
 *
 * Pure: the caller owns the set of already-awarded keys, and this mutates
 * neither it nor its input.
 *
 * @param results    Score results from the engine.
 * @param developerLogin
 *   Who the run was for. Required because the key is scoped per developer, and a
 *   result does not carry the developer — taking it from a result would mean
 *   trusting the event's own claim about itself.
 * @param scoringVersion The version the run used, matching the results.
 */
export function filterNewAwards(
  results: readonly {
    eventId: string;
    eligible: boolean;
    scoringVersion: ScoringVersionId;
  }[],
  developerLogin: string,
  scoringVersion: ScoringVersionId,
  options: IdempotentScoringOptions = {},
): IdempotencyDecision[] {
  const seen = new Set<string>(options.alreadyAwarded ?? []);
  const decisions: IdempotencyDecision[] = [];

  for (const result of results) {
    // A rejection produced no award, so it cannot be a double award.
    const key = idempotencyKey(developerLogin, result.eventId, scoringVersion);

    decisions.push({
      eventId: result.eventId,
      key,
      duplicate: result.eligible && seen.has(key),
    });

    if (result.eligible) seen.add(key);
  }

  return decisions;
}

/**
 * The `XPTransaction` ids that should be recorded for a run.
 *
 * A helper over {@link filterNewAwards} for the common case of caller wanting the
 * keys rather than the decisions.
 */
export function keysToAward(
  results: readonly {
    eventId: string;
    eligible: boolean;
    scoringVersion: ScoringVersionId;
  }[],
  developerLogin: string,
  scoringVersion: ScoringVersionId,
  options: IdempotentScoringOptions = {},
): string[] {
  return filterNewAwards(results, developerLogin, scoringVersion, options)
    // A key is worth recording only when it is not a duplicate *and* it belongs
    // to an eligible event: a rejection produced no award, so there is nothing
    // to record even though it is not a double award.
    .filter((decision, index) => !decision.duplicate && results[index].eligible)
    .map((decision) => decision.key);
}

/**
 * Whether processing the same batch twice would award anything the second time.
 *
 * The acceptance criterion, expressed directly: a run followed by itself must
 * produce no new awards.
 */
export function isIdempotent(
  results: readonly {
    eventId: string;
    eligible: boolean;
    scoringVersion: ScoringVersionId;
  }[],
  developerLogin: string,
  scoringVersion: ScoringVersionId,
): boolean {
  const first = filterNewAwards(results, developerLogin, scoringVersion);
  if (first.length === 0) return true;

  // The second pass sees every key the first produced.
  const second = filterNewAwards(
    results,
    developerLogin,
    scoringVersion,
    { alreadyAwarded: first.map((decision) => decision.key) },
  );

  return second.every((decision) => decision.duplicate);
}
