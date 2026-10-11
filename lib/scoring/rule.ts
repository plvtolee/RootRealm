/**
 * RootRealm — scoring rule scaffolding (TASKS 5.2–5.8).
 *
 * Every rule answers the same three questions: is this event mine, does it
 * qualify, and what does it award? This module owns the answer's *shape* so the
 * rules only own the judgement.
 *
 * ## Why rules return `ScoreResult | null`
 *
 * `null` means "not my concern" — a release rule handed a pull request. That is
 * different from an ineligible event, which is a real outcome carrying a
 * rejection reason (`SCORING.md` §35). Collapsing the two would make dispatch
 * unable to tell "no rule handles this" from "the rule declined", and those
 * produce different explanations.
 *
 * ## Eligibility is shared, qualification is per-rule
 *
 * `SCORING.md` §5 lists eight eligibility checks. Most are not per-rule at all:
 *
 * - *exists in normalized form* — guaranteed by receiving a `DeveloperEvent`;
 * - *stable source identity* — guaranteed by `DeveloperEvent.id`;
 * - *not already rewarded* — a persistence question, owned by TASKS 5.11 and
 *   the ledger, since a pure rule has no memory;
 * - *passes event-specific rules* and *within scoring scope* — per-rule, by
 *   definition;
 * - *not rejected by anti-farming* — per-rule, and only where a rule can detect
 *   the pattern (§9 names self-generated review loops).
 *
 * That leaves attribution, which every rule needs identically, so it lives in
 * {@link attributable} rather than being re-implemented six times.
 */
import type { DeveloperEvent } from "../developer-event";
import {
  idempotencyKey,
  type Attribute,
  type AttributeAward,
  type RejectionReason,
  type ScoreResult,
  type ScoringClassification,
  type ScoringVersion,
} from "./types";

/** One attribute's share of an award, before the rule's identity is attached. */
export interface AttributeShare {
  readonly attribute: Attribute;
  /** Attribute units (`SCORING.md` §16). Integer, normally 1. */
  readonly amount: number;
}

/**
 * A scoring rule.
 *
 * `ruleId` is persisted on every award and ledger entry (§16, §17), so it is a
 * stable identifier rather than a label — renaming one would orphan historical
 * explanations. Namespaced `subject.outcome`, e.g. `pr.merged`.
 */
export interface ScoringRule {
  readonly ruleId: string;
  /**
   * Scores the event, or returns `null` when the event is not this rule's
   * concern. Must be pure: no clock, no network, no mutation.
   */
  readonly evaluate: (
    event: DeveloperEvent,
    version: ScoringVersion,
  ) => ScoreResult | null;
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether the evidence ties this event to the developer (`SCORING.md` §5
 * rule 3, §6).
 *
 * Rejects `inferred` outright, which is deliberately stricter than §6 requires.
 * §6 permits inferred evidence only where a rule "explicitly defined" its use,
 * and warns against giving it "the same treatment as directly verified
 * evidence". No rule in this phase admits it, so the safe default is to decline
 * and say why — `insufficient_evidence` is a rejection reason §35 already names.
 *
 * A rule that later wants to admit inferred evidence must say so at its own call
 * site, which is the point: admitting it should be a visible decision, not a
 * default nobody noticed.
 */
export function attributable(event: DeveloperEvent): boolean {
  return event.confidence === "verified";
}

/**
 * Whether the event can cite a stable source (`SCORING.md` §8).
 *
 * A rule whose evidence is meaningless without a reference — a pull request
 * number, a release tag — checks the field it needs rather than the event's
 * generic identity, because `DeveloperEvent.id` is always present and would make
 * this check vacuous.
 */
export function hasReference(value: string | number | null): boolean {
  return value !== null;
}

/* -------------------------------------------------------------------------- */
/* Building results                                                            */
/* -------------------------------------------------------------------------- */

export interface AwardInput {
  readonly event: DeveloperEvent;
  readonly version: ScoringVersion;
  readonly ruleId: string;
  readonly classification: ScoringClassification;
  readonly xp: number;
  readonly reason: string;
  readonly attributes: readonly AttributeShare[];
}

/**
 * Builds an eligible result, attaching the event and rule identity to each
 * attribute award so the ledger can trace any award to its evidence (§17).
 */
export function award(input: AwardInput): ScoreResult {
  const { event, version, ruleId, attributes } = input;

  const attributeAwards: AttributeAward[] = attributes.map((share) => ({
    attribute: share.attribute,
    amount: share.amount,
    eventId: event.id,
    ruleId,
  }));

  return {
    eventId: event.id,
    eligible: true,
    xp: input.xp,
    classification: input.classification,
    reason: input.reason,
    attributeAwards,
    scoringVersion: version.id,
  };
}

export interface RejectionInput {
  readonly event: DeveloperEvent;
  readonly version: ScoringVersion;
  readonly reason: string;
  readonly rejectionReason: RejectionReason;
  /**
   * The classification the rule recognised, when it got far enough to name one.
   *
   * §17 wants an explanation of what happened, and "this was a pull request that
   * was never merged" is more useful than "this was rejected".
   */
  readonly classification?: ScoringClassification | null;
}

/** Builds a zero-XP ineligible result. */
export function reject(input: RejectionInput): ScoreResult {
  const { event, version } = input;

  return {
    eventId: event.id,
    eligible: false,
    xp: 0,
    classification: input.classification ?? null,
    reason: input.reason,
    attributeAwards: [],
    scoringVersion: version.id,
    rejectionReason: input.rejectionReason,
  };
}

/**
 * The XP value for a classification, or `null` when the version does not define
 * one.
 *
 * `qualifying_commit` is the live case: `SCORING.md` §4 gives it `+3`, but TASKS
 * 4.4 established that commit volume is not observable from the activity feed,
 * so `SCORING_V1.xp.qualifying_commit` is `null` and a rule must not invent a
 * value. TASKS 5.2 scores that line as `qualifying_push` instead; the null stays
 * so the commit-level gap remains visible rather than being quietly satisfied by
 * a different unit.
 *
 * Returning `null` rather than 0 keeps "undefined for this version"
 * distinguishable from "worth nothing" — a rule awarding 0 XP would look like a
 * deliberate judgement rather than an absent value.
 */
export function xpFor(
  version: ScoringVersion,
  classification: ScoringClassification,
): number | null {
  return version.xp[classification];
}

/**
 * The idempotency key a rule's award would be recorded under (`SCORING.md` §18).
 *
 * Exposed so a caller can ask "have we already awarded this?" before scoring,
 * without duplicating the key format. Two producers of this string would defeat
 * idempotency silently, so it is built in exactly one place.
 */
export function keyFor(
  event: DeveloperEvent,
  version: ScoringVersion,
): string {
  return idempotencyKey(event.developerLogin, event.id, version.id);
}
