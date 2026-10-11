/**
 * RootRealm — explanation ledger (TASKS 5.10).
 *
 * ```text
 * ScoreResult → XPTransaction
 * ```
 *
 * TASKS 5.10: "Ensure every award produces: event, reason, XP, attribute impact,
 * scoring version, source URL." `XPTransaction` is the type designed in TASKS 5.1
 * to carry exactly those, and this module is the one place a `ScoreResult`
 * becomes one.
 *
 * ## Only eligible events produce a ledger entry
 *
 * A rejection is not a transaction. `SCORING.md` §35's rejection reasons exist so
 * a UI can explain why something earned nothing, but an award record for an event
 * that awarded nothing would be a row claiming nothing happened — which is worse
 * than no row, because a reader can act on it.
 *
 * Rejections are therefore reported alongside, not as: {@link ledgerEntriesFor}
 * takes a mixed batch and returns transactions for the eligible events only.
 * That also mirrors the pipeline, where eligibility (SCORING.md §5) precedes the
 * award, so a caller screening out duplicates first cannot accidentally convert a
 * rejected result into a record.
 *
 * ## Why `awardedAt` is passed in
 *
 * A pure function cannot know when it ran. Taking the timestamp as an argument is
 * what keeps this module deterministic and testable, and it means the caller owns
 * the clock — the same discipline the ingestion services use. It also means a
 * replay can reproduce historical timestamps rather than stamping "now".
 *
 * ## What this module does not do
 *
 * It does not check whether an event was already awarded. That is §18
 * idempotency and needs state, so it belongs to TASKS 5.11. This module's job is
 * that *if* an award is granted, it is recorded completely and explainable.
 */
import type { DeveloperEvent } from "../developer-event";
import { idempotencyKey, type ScoreResult, type XPTransaction } from "./types";

/**
 * A recorded award, ready to persist.
 *
 * A type alias rather than an empty interface extending `XPTransaction`, which
 * adds nothing and is flagged as equivalent to its supertype.
 */
export type LedgerEntry = XPTransaction;

export interface LedgerInput {
  /** The scored result, which must be eligible. */
  result: ScoreResult;
  /** The event that was scored, for the fields a ScoreResult does not carry. */
  event: DeveloperEvent;
  /** When the award was recorded, ISO-8601. Supplied by the caller. */
  awardedAt: string;
}

/**
 * Builds the ledger entry for one awarded event.
 *
 * Throws on an ineligible result. Silently returning nothing would let a caller
 * mistake a rejection for an award, and a caller that wants to skip rejections
 * should screen them out first — which {@link ledgerEntriesFor} does.
 */
export function ledgerEntryFor({
  result,
  event,
  awardedAt,
}: LedgerInput): LedgerEntry {
  if (!result.eligible) {
    throw new Error(
      `Cannot build a ledger entry for an ineligible event ${result.eventId}: ` +
        `${result.rejectionReason ?? "no reason given"}`,
    );
  }

  if (result.classification === null) {
    throw new Error(
      `An eligible event ${result.eventId} must carry a classification, ` +
        `or its award cannot be explained (§17).`,
    );
  }

  const ruleId = result.attributeAwards[0]?.ruleId ?? "none";

  return {
    // §18: identity and idempotency key are the same thing, so uniqueness of
    // this key is what prevents a double award.
    id: idempotencyKey(event.developerLogin, event.id, result.scoringVersion),
    eventId: event.id,
    developerLogin: event.developerLogin,
    xp: result.xp,
    classification: result.classification,
    reason: result.reason,
    ruleId,
    attributeAwards: result.attributeAwards,
    scoringVersion: result.scoringVersion,
    // §17 wants the award explained, so a composed award's line-by-line
    // breakdown has to survive persistence. Absent rather than `[]` when the
    // award spans one line, matching how `ScoreResult` reports it.
    ...(result.breakdown === undefined ? {} : { breakdown: result.breakdown }),
    // §12 "retain the source issue URL" and §17 "Source" both read from here.
    sourceUrl: event.sourceUrl,
    awardedAt,
  };
}

/**
 * Builds ledger entries for a scoring run, skipping what was rejected.
 *
 * Every entry is complete by construction — this is the only place a
 * `ScoreResult` becomes a transaction, so no caller can produce a partial one.
 */
export function ledgerEntriesFor(
  results: readonly ScoreResult[],
  events: readonly DeveloperEvent[],
  awardedAt: string,
): LedgerEntry[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const entries: LedgerEntry[] = [];

  for (const result of results) {
    if (!result.eligible) continue;

    const event = byId.get(result.eventId);
    if (event === undefined) {
      throw new Error(
        `No event found for eligible result ${result.eventId}; a ledger entry ` +
          `must cite the evidence it was awarded for.`,
      );
    }

    entries.push(ledgerEntryFor({ result, event, awardedAt }));
  }

  return entries;
}
