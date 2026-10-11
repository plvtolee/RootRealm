/**
 * RootRealm — scoring types (TASKS 5.1).
 *
 * The vocabulary every later scoring task speaks. This module is deliberately
 * types and one version definition, not rules: TASKS 5.2–5.8 implement the
 * rules, TASKS 5.9 the attribute mapping, TASKS 5.11 the idempotency, TASKS 5.13
 * the level curve. What lands here is the shape they all agree on.
 *
 * ## Sources
 *
 * `SCORING.md` specifies most of this and is the authority where it does:
 *
 * - §3 — a calculation belongs to a *named* scoring version, and a historical
 *   transaction retains the version that generated it;
 * - §4 — the starting XP values;
 * - §16 — `AttributeAward`, including `eventId` and `ruleId`;
 * - §17 — the explanation ledger's fields;
 * - §33 — the pure function signatures these types serve;
 * - §34 — `ScoreResult`;
 * - §35 — the rejection reasons.
 *
 * `XPTransaction` is named in TASKS 5.1 and TASKS 10.2 (as a table) but is
 * specified nowhere, so it is designed here to satisfy §17 and §18 at once — see
 * the type's own note.
 *
 * ## Two decisions worth defending
 *
 * 1. **A scoring version carries its own XP values.**
 *
 *    §3 requires that a historical transaction retain the version that produced
 *    it, and that tuning values "must not silently rewrite" history. A bare
 *    `"scoring-v1"` string cannot do that on its own — replaying an old ledger
 *    entry would need today's numbers. Binding the table to the version makes an
 *    old transaction re-explainable without keeping a parallel table of
 *    historical values somewhere else.
 *
 * 2. **`AttributeAward` follows §16, not §34's inline shape.**
 *
 *    §34 sketches `attributeAwards` as `{ attribute, amount }` and calls it a
 *    "suggested shape"; §16 defines the fuller award with `eventId` and `ruleId`.
 *    §34's own version is a strict subset, so carrying the fuller type satisfies
 *    both — and an award that can name the rule that produced it is the whole
 *    point of TASKS 5.10's ledger.
 */

/* -------------------------------------------------------------------------- */
/* Attributes (TASKS 5.9)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The six attributes (`SCORING.md` §14, TASKS 5.9).
 *
 * Lower-cased here because these are persisted keys; presentation casing belongs
 * to the UI.
 */
export type Attribute =
  | "builder"
  | "debugger"
  | "scholar"
  | "collaborator"
  | "maintainer"
  | "architect";

/** Every attribute, for exhaustive iteration and for tally initialisation. */
export const ATTRIBUTES: readonly Attribute[] = [
  "builder",
  "debugger",
  "scholar",
  "collaborator",
  "maintainer",
  "architect",
];

/* -------------------------------------------------------------------------- */
/* Classification                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What a scoring rule decided an event *is*.
 *
 * Distinct from `DeveloperEventKind`: the kind is what GitHub reported, the
 * classification is what the rules concluded. A `push` is a kind; whether it is
 * a `qualifying_commit` is a classification, and one push can be neither.
 *
 * These names match the `SCORING.md` §17 ledger example (`merged_pull_request`)
 * and the §4 value table, so an explanation quotes the same vocabulary the spec
 * uses.
 */
export type ScoringClassification =
  /**
   * §7 — a commit that qualifies.
   *
   * Still unawardable: TASKS 4.4 verified that no ingested event carries a commit
   * list. See {@link XpTable} — and `qualifying_push`, which awards the same
   * evidence at a coarser unit rather than leaving the line unearned.
   */
  | "qualifying_commit"
  /**
   * A push that landed code on a branch (§7's line, scored per push).
   *
   * Named for what is actually observed. §7 awards `+3 XP` per *qualifying
   * commit*, but a `PushEvent` carries no commit list, so the unit we can
   * honestly score is the push. Naming it `qualifying_commit` would assert a
   * granularity the data does not have — the exact confusion the `push` event
   * kind exists to avoid.
   */
  | "qualifying_push"
  /** §8 — a merged pull request. */
  | "merged_pull_request"
  /** §9 — a completed review. */
  | "completed_review"
  /** §10 — a linked issue closure. */
  | "linked_issue_closure"
  /** §11 — a release. */
  | "release"
  /** §12 — qualifying documentation. */
  | "qualifying_documentation"
  /** §13 — a verified regression test. */
  | "verified_regression_test";

/**
 * Why an event produced no award (`SCORING.md` §35).
 *
 * A closed union rather than a free string: §35 states these are
 * "machine-readable", and a UI translating them into explanations (§35) needs to
 * be able to enumerate what it might receive.
 */
export type RejectionReason =
  | "duplicate_event"
  | "invalid_event"
  | "insufficient_evidence"
  | "not_attributable"
  | "not_qualifying"
  | "already_rewarded"
  | "outside_scoring_scope"
  | "anti_farming_rule"
  | "unsupported_event";

/* -------------------------------------------------------------------------- */
/* Scoring version                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The persisted identifier of a scoring version.
 *
 * Deliberately a closed union of literals rather than `string`: §3's guarantee
 * is that a transaction retains *the version that generated it*, and a typo in a
 * free string would silently create a version nobody defined. Adding a version
 * is meant to be a deliberate edit to this list.
 */
export type ScoringVersionId = "scoring-v1";

/**
 * The XP values one version awards, keyed by classification (`SCORING.md` §4).
 *
 * §4 is explicit that these are "starting placeholders for implementation and
 * tuning" and "NOT final balance values", so they live on the version rather
 * than as constants — tuning produces a new version, not an edit to this one.
 *
 * ## `qualifying_commit` stays `null`, and `qualifying_push` takes its place
 *
 * TASKS 4.4 verified against the live API that a `PushEvent` carries **no commit
 * list**, so §7's per-commit award cannot be computed from the activity feed. A
 * `number` here would invite a rule to multiply by a count that does not exist.
 *
 * TASKS 5.2 resolved this the second way §7's own note allows — by scoring the
 * push as a whole unit, under a name that says so:
 *
 * - `qualifying_commit` remains `null`, so §7's literal line stays visibly
 *   unimplemented rather than quietly satisfied by a different unit. If a commit
 *   source is ever added, the two coexist without ambiguity: a push awards once
 *   for landing the code, and its commits can additionally award per commit.
 * - `qualifying_push` carries the value. It is `+3`, §7's own number, applied per
 *   push. That keeps the balance the spec intended — implementation work is the
 *   smallest and cheapest thing recognised — while scoring only what the data can
 *   support.
 */
export interface XpTable {
  /**
   * §7 — deliberately `null`. See above. `null` rather than `0` so "unimplemented
   * for this version" stays distinguishable from "worth nothing".
   */
  readonly qualifying_commit: number | null;
  /**
   * §7's value, awarded per push.
   *
   * A push may contain one commit or fifty, and they are indistinguishable here,
   * so this is a flat award per landed push rather than a per-commit one. That is
   * the conservative direction: a developer cannot farm XP by splitting work into
   * more pushes, and a single large push is not over-rewarded either.
   */
  readonly qualifying_push: number;
  readonly merged_pull_request: number;
  readonly completed_review: number;
  readonly linked_issue_closure: number;
  readonly release: number;
  readonly qualifying_documentation: number;
  readonly verified_regression_test: number;
}

export interface ScoringVersion {
  /** The value persisted on every transaction. */
  readonly id: ScoringVersionId;
  /** When this version took effect, ISO-8601. */
  readonly introducedAt: string;
  /** Why this version exists — a tuning note, not a changelog. */
  readonly notes?: string;
  /** The values this version awards. */
  readonly xp: XpTable;
}

/**
 * The first scoring version (`SCORING.md` §4).
 *
 * `qualifying_commit` is `null` because commit volume is not observable from the
 * events feed; §7's line is scored per push as `qualifying_push` instead — see
 * {@link XpTable}.
 */
export const SCORING_V1: ScoringVersion = {
  id: "scoring-v1",
  introducedAt: "2026-10-11",
  notes:
    "Initial values from SCORING.md §4, which the spec describes as starting " +
    "placeholders to be tuned against real profiles before launch. §7's " +
    "per-commit line is scored per push, as commit counts are not observable " +
    "from the events feed.",
  xp: {
    qualifying_commit: null,
    // §7's +3, awarded per push — see the note in {@link XpTable}.
    qualifying_push: 3,
    merged_pull_request: 30,
    completed_review: 15,
    linked_issue_closure: 20,
    release: 25,
    qualifying_documentation: 10,
    verified_regression_test: 12,
  },
};

/** Every defined version, for lookup by id. */
export const SCORING_VERSIONS: Readonly<Record<ScoringVersionId, ScoringVersion>> = {
  "scoring-v1": SCORING_V1,
};

/* -------------------------------------------------------------------------- */
/* Awards and results                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One attribute's share of an award (`SCORING.md` §16).
 *
 * `amount` is measured in attribute *units*, not XP — §16 introduces them
 * specifically so "attribute balances can evolve independently from the global
 * XP balance". §15 keeps the two axes separate and this type is where that
 * separation is enforced: there is no XP field here.
 */
export interface AttributeAward {
  readonly attribute: Attribute;
  /** Attribute units awarded. Integer. */
  readonly amount: number;
  /** The event that earned it, so an award is traceable to its evidence. */
  readonly eventId: string;
  /** The rule that produced it, e.g. `pr.merged`. */
  readonly ruleId: string;
}

/**
 * The outcome of scoring one event (`SCORING.md` §34).
 *
 * An ineligible event is a *result*, not an error: §35's rejection reasons are
 * data the UI explains, and §5's eligibility checks are expected to reject
 * plenty. So `eligible: false` carries a `rejectionReason` and zero awards rather
 * than throwing — the same discriminated-outcome discipline as ingestion.
 */
export interface ScoreResult {
  /** The `DeveloperEvent.id` this result scored. */
  readonly eventId: string;
  readonly eligible: boolean;
  /** Total XP awarded. Zero when ineligible. Integer. */
  readonly xp: number;
  /**
   * What was decided, in the §17 vocabulary. Present even when ineligible —
   * knowing an event was recognised but did not qualify is part of explaining it.
   */
  readonly classification: ScoringClassification | null;
  /** Human-readable justification, safe to render. */
  readonly reason: string;
  readonly attributeAwards: readonly AttributeAward[];
  readonly scoringVersion: ScoringVersionId;
  /** Present exactly when `eligible` is false. */
  readonly rejectionReason?: RejectionReason;
}

/* -------------------------------------------------------------------------- */
/* Ledger                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A recorded award (`TASKS 5.1`, `TASKS 10.2`; fields from `SCORING.md` §17).
 *
 * Not specified in `SCORING.md`, so it is designed to satisfy three requirements
 * at once:
 *
 * - §17 — the explanation ledger needs event, classification, XP, attribute
 *   impact, reason, version and source;
 * - §18 — idempotency rests on "a stable event identity plus an idempotency
 *   key", whose documented form is `xp:user123:event456:scoring-v1`. That key
 *   *is* this record's identity, so `id` is the key rather than a separate
 *   surrogate: two transactions colliding on `id` would mean the same event was
 *   awarded twice under one version, which is precisely what must not happen;
 * - §3 — a historical transaction retains its scoring version, and
 *   {@link ScoringVersion} retains the values, so an old entry stays explainable.
 *
 * Every field is a primitive or an array of them, so the record persists without
 * transformation — it is a table row (`TASKS 10.2`) as much as a type.
 */
export interface XPTransaction {
  /**
   * The idempotency key: `xp:<login>:<eventId>:<scoringVersion>`.
   *
   * Primary key. Uniqueness is the mechanism by which repeated processing cannot
   * double-award (§18), so it is the transaction's identity rather than metadata.
   */
  readonly id: string;
  /** The `DeveloperEvent.id` that earned this. */
  readonly eventId: string;
  /** Who the award belongs to. */
  readonly developerLogin: string;
  readonly xp: number;
  readonly classification: ScoringClassification;
  /** Human-readable justification (§17 "Reason"). */
  readonly reason: string;
  /** The rule that produced the award, e.g. `pr.merged`. */
  readonly ruleId: string;
  readonly attributeAwards: readonly AttributeAward[];
  /** The version that produced this award (§3). */
  readonly scoringVersion: ScoringVersionId;
  /** Evidence link, when the event had one (§17 "Source"). */
  readonly sourceUrl: string | null;
  /** When the award was recorded, ISO-8601. */
  readonly awardedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Builds the idempotency key for an event under a version (`SCORING.md` §18).
 *
 * Explicitly not the one in `lib/event-dedupe.ts`: that one takes a
 * `DeveloperEvent` and exists for TASKS 4.6's duplicate detection. This takes
 * identifiers, so scoring can build a key without holding the event — the point
 * in §18 being that the key survives the event no longer being in memory.
 *
 * Kept as a free function rather than a method so both call sites produce
 * byte-identical keys; a divergence here would silently defeat idempotency.
 */
export function idempotencyKey(
  developerLogin: string,
  eventId: string,
  scoringVersion: ScoringVersionId,
): string {
  return `xp:${developerLogin}:${eventId}:${scoringVersion}`;
}

/** An empty attribute tally, so every attribute is always represented. */
export function emptyAttributeTally(): Record<Attribute, number> {
  return {
    builder: 0,
    debugger: 0,
    scholar: 0,
    collaborator: 0,
    maintainer: 0,
    architect: 0,
  };
}

/** Zero-XP ineligible result, so every rejection is shaped identically. */
export function ineligibleResult(
  eventId: string,
  scoringVersion: ScoringVersionId,
  reason: string,
  rejectionReason: RejectionReason,
  classification: ScoringClassification | null = null,
): ScoreResult {
  return {
    eventId,
    eligible: false,
    xp: 0,
    classification,
    reason,
    attributeAwards: [],
    scoringVersion,
    rejectionReason,
  };
}
