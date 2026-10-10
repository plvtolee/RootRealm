/**
 * RootRealm — six attribute mapping (TASKS 5.9).
 *
 * `SCORING.md` §14 assigns each of the six attributes a set of primary evidence.
 * TASKS 5.9 asks that "each event type map through explicit, testable rules", and
 * this module is that mapping — one table, asserted in full by its tests, rather
 * than an attribute buried in each of the five rules.
 *
 * ## Why a table rather than five hard-coded choices
 *
 * The rules each awarded their own attribute when written, which satisfies §14 in
 * isolation but leaves nothing to check: the mapping was only visible by reading
 * five files. Centralising it means a single test can enumerate what every
 * classification awards, and any change to one row has to confront the whole
 * table.
 *
 * ## Architect earns nothing, and that is the point
 *
 * §14 gives Architect's primary evidence as "verified refactoring,
 * modularization, system design work", and adds that "Architect scoring should be
 * conservative because the underlying evidence is harder to infer reliably from
 * public GitHub activity".
 *
 * Taking that seriously: nothing ingested distinguishes architectural work. A push
 * carries no commit list and no file paths, a pull request is a five-field stub
 * with no `changed_files`, and the remaining events are counts and states.
 * Refactoring, modularization and system design are all claims about *what*
 * changed, and no event we read exposes that.
 *
 * So Architect maps to nothing, permanently, until an evidence source exists —
 * and a test asserts that it does. That test exists to make the gap deliberate:
 * an implementer who later adds a signal must find and change that assertion,
 * rather than quietly filling the row in and calling §14 satisfied.
 *
 * The temptation here is to award Architect for something convenient — a push to
 * many repositories, a large pull request — and §14 pre-empts exactly that with
 * "conservative because the underlying evidence is harder to infer".
 *
 * ## The two deferred classifications
 *
 * `qualifying_commit` and `verified_regression_test` map to nothing today because
 * no rule awards either, and that is a matter of evidence rather than value.
 *
 * The distinction matters: a commit has neither an XML value (§4 gives none, and
 * TASKS 5.2 is deferred) nor any evidence to qualify one. A regression test *has*
 * an XML value — §4 gives it `+12` — but no ingested event can identify one, so
 * that value is currently unreachable. Both rows are empty because both are
 * unawardable, and noting where they differ keeps the gap honest: the regression
 * test's value exists and is waiting on data, not on a decision about worth.
 */
import {
  ATTRIBUTES,
  type Attribute,
  type ScoringClassification,
} from "./types";

/**
 * How much of one attribute an award contributes, before the event and rule
 * identity are attached.
 *
 * `1` is the baseline throughout, following §17's illustration of "+1
 * contribution unit". §16 keeps attribute units separate from XP precisely so
 * these can move independently.
 */
export interface AttributeMapping {
  readonly attribute: Attribute;
  /** Attribute units. */
  readonly amount: number;
}

/**
 * What a mapping decision depends on.
 *
 * Only one classification currently splits, and it does so on a fact the event
 * carries rather than on a guess: §14 gives issue evidence to Debugger ("linked
 * bug fixes") *and* Maintainer ("issue triage"), and whether the developer closed
 * their own issue or someone else's decides which.
 */
export interface MappingContext {
  /** For `linked_issue_closure`: did the developer open the issue they closed? */
  readonly issueAuthored?: boolean;
}

/** Binds an attribute and a unit count, so the table reads as a decision. */
function unit(
  attribute: Attribute,
  amount = 1,
): AttributeMapping {
  return { attribute, amount };
}

const BUILDER = unit("builder");
const DEBUGGER = unit("debugger");
const SCHOLAR = unit("scholar");
const COLLABORATOR = unit("collaborator");
const MAINTAINER = unit("maintainer");

const none: readonly AttributeMapping[] = [];

/**
 * The §14 mapping.
 *
 * Keys are every `ScoringClassification`, so adding a classification without
 * deciding its mapping is a compile error rather than a silently empty award.
 */
export const ATTRIBUTE_MAPPING: Record<
  ScoringClassification,
  (context: MappingContext) => readonly AttributeMapping[]
> = {
  // Deferred with TASKS 5.2 — no evidence source. §14's "qualifying
  // implementation work" would point at Builder.
  qualifying_commit: () => none,

  // §14 Builder: "merged implementation PRs".
  merged_pull_request: () => [BUILDER],

  // §14 Collaborator: "completed PR reviews". §9 also says reviews "may
  // contribute to other attributes only if explicitly defined", and none is.
  completed_review: () => [COLLABORATOR],

  // §14 splits issue evidence between Debugger ("linked bug fixes") and
  // Maintainer ("issue triage"). The event says which, so the mapping does not
  // have to guess.
  linked_issue_closure: (context) =>
    context.issueAuthored ? [DEBUGGER] : [MAINTAINER],

  // §14 Maintainer: "releases".
  release: () => [MAINTAINER],

  // §14 Scholar: "qualifying documentation".
  qualifying_documentation: () => [SCHOLAR],

  // Deferred with TASKS 5.8 — no file-level evidence. §13 names Debugger.
  verified_regression_test: () => none,

  // Architect is absent by design. See the module header: no available evidence
  // can distinguish architectural work, and §14 asks for it to be conservative.
};

/** Resolves the attribute shares one classification awards. */
export function attributeUnitsFor(
  classification: ScoringClassification,
  context: MappingContext = {},
): readonly AttributeMapping[] {
  return ATTRIBUTE_MAPPING[classification](context);
}

/** Every classification, so a test can enumerate the table without hand-listing. */
export const ALL_CLASSIFICATIONS = Object.keys(
  ATTRIBUTE_MAPPING,
) as ScoringClassification[];

/**
 * Attributes some classification currently awards.
 *
 * Derived rather than hand-maintained so a new row cannot forget to register
 * itself, and computed over both values of the only conditional row.
 */
export const AWARDED_ATTRIBUTES: ReadonlySet<Attribute> = new Set(
  ALL_CLASSIFICATIONS.flatMap((classification) =>
    [true, false].flatMap((issueAuthored) =>
      ATTRIBUTE_MAPPING[classification]({ issueAuthored }).map(
        (mapping) => mapping.attribute,
      ),
    ),
  ),
);

/** Attributes no classification awards yet. */
export const UNAWARDED_ATTRIBUTES: readonly Attribute[] = ATTRIBUTES.filter(
  (attribute) => !AWARDED_ATTRIBUTES.has(attribute),
);

/** Whether any classification currently awards this attribute. */
export function attributeIsAwarded(attribute: Attribute): boolean {
  return AWARDED_ATTRIBUTES.has(attribute);
}
