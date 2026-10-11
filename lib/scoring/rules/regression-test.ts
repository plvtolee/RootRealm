/**
 * RootRealm — regression test scoring (TASKS 5.8).
 *
 * `SCORING.md` §13: a verified regression test is `+12 XP`, contributes primarily
 * to **Debugger**, and should represent "meaningful test coverage associated with
 * fixing or preventing a defect". §13 adds that the system "should avoid
 * rewarding repetitive or meaningless test generation".
 *
 * ## Why this is not a separate rule on `pull_request`
 *
 * It would be the natural shape — its own `ScoringRule`, its own registry entry —
 * and it cannot work. Dispatch is first-match, and `pr.merged` returns a result for
 * **every** `pull_request` event, so a second rule claiming that kind would never
 * be reached. Dead code with its own tests is worse than no code.
 *
 * The structural facts, for completeness:
 *
 * - §33 specifies `scoreEvent(event, version): ScoreResult` — one result per event;
 * - §18's idempotency key is `xp:<login>:<eventId>:<version>`, scoped to the event,
 *   and it is the ledger's primary key — two transactions for one event collide.
 *
 * So a merged pull request carrying a regression test is one transaction spanning
 * two §4 lines. {@link additionalRegressionTestAward} returns the second line for
 * `pr.merged` to fold in, and the combined award carries a `breakdown` naming both.
 * One event, one transaction, two explainable lines.
 *
 * ## The defect association is not verified, and this is the real limit
 *
 * §13 asks for a test "associated with fixing or preventing a defect". What this
 * rule can check is *a merged pull request touched a test file*. It cannot check
 * that the test covers the defect the pull request fixed, because that needs the
 * pull request's issue links — a different endpoint, from the timeline API, which
 * nothing ingests today.
 *
 * The award is therefore made on the merge plus the test file, and the missing half
 * is named here rather than papered over. Three things keep that honest:
 *
 * - the merged pull request already had to qualify as work (5.3), so this is an
 *   *additional* recognition of a test inside real shipped work, not a way to
 *   manufacture XP from test files alone;
 * - §13's `+12` sits below §8's `+30`, so the association being unverified cannot
 *   make test-heavy work outweigh the fix itself;
 * - a test in an unmerged pull request earns nothing, because nothing shipped.
 *
 * ## §13's "meaningful" and §20's farming warning
 *
 * Neither is decidable from a filename, and pretending otherwise would be the
 * failure §13 names. What *is* decidable is whether a test-shaped file was added
 * or modified, which {@link detectTestCoverage} grades: `strong` for a file that is
 * a test by language convention, `weak` for the ambiguous middle. Only `strong`
 * is awarded, so a fixture or a shared helper pays nothing.
 *
 * What this rule cannot do is tell a hand-written test from a generated one, or
 * tell a real assertion from an empty shell. `test-generation` tooling produces
 * filenames indistinguishable from written ones. The award is for the *act* of
 * adding test coverage to shipped work; §13's "meaningful" remains a judgement
 * neither this rule nor any filename convention can make.
 *
 * ## Duplicates
 *
 * §13 awards a flat `+12` with no per-file multiplier, so adding a hundred test
 * files in one pull request earns exactly what adding one does. Quantity is
 * therefore not farmable, and a test asserting that guards the property from
 * regressing into a per-file award later.
 */
import type { DeveloperEvent, PullRequestEvidence } from "../../developer-event";
import { attributeUnitsFor } from "../attributes";
import { detectTestCoverage } from "../test-detection";
import type { AdditionalAward } from "../rule";
import type { ScoringVersion } from "../types";

export const RULE_ID = "pr.regression_test";

/**
 * Whether this pull request carries test coverage strong enough to award.
 *
 * Returns `null` when the question cannot be answered — files were never fetched,
 * which is the state until TASKS 5.8's ingestion task supplies them. The caller
 * must treat `null` as *unknown* and decline with that stated, never as `false`.
 */
export function regressionTestGrade(
  evidence: PullRequestEvidence,
): "strong" | null {
  if (evidence.testFiles === null) return null;

  // Graded on the paths as given. `status` is not consulted here because the
  // files endpoint has already filtered removals out by the time evidence is
  // built; the classifier's own status handling is for direct callers.
  const coverage = detectTestCoverage(
    evidence.testFiles.map((filename) => ({ filename, status: "added" })),
  );

  return coverage.grade === "strong" ? "strong" : null;
}

/**
 * The §13 line, when this merged pull request also added test coverage.
 *
 * Returns `null` for every case where it should not be awarded: no test evidence,
 * weak evidence, or not a merge. `pr.merged` only calls this once the merge itself
 * has qualified, so `merged` is re-checked here only to keep the function
 * independently safe to call.
 */
export function additionalRegressionTestAward(
  evidence: PullRequestEvidence,
  xp: number,
): AdditionalAward | null {
  // A test in an unmerged pull request has not prevented anything yet. §13 is
  // about coverage that protects a fix, and an unmerged change protects nothing.
  if (evidence.merged !== true) return null;
  if (regressionTestGrade(evidence) === null) return null;

  return {
    classification: "verified_regression_test",
    ruleId: RULE_ID,
    xp,
    // §13: "This contributes primarily to: Debugger". Resolved through the
    // central table so 5.9 stays the one place an attribute is decided.
    attributes: attributeUnitsFor("verified_regression_test"),
  };
}

/**
 * Whether the event carries the evidence this rule needs, for a rule that must
 * explain itself when it declines.
 *
 * Not a `ScoringRule`: the first-match dispatch described in the module header
 * means this can never own an event. Exported so `pr.merged` and the tests can
 * ask, and so the pipeline can report which pull requests were awaiting evidence.
 */
export function testFilesUnavailable(event: DeveloperEvent): boolean {
  return (
    event.kind === "pull_request" &&
    event.limitations.includes("test_files_unavailable")
  );
}

/**
 * The §13 value from a scoring version.
 *
 * A named accessor rather than a caller reaching into `version.xp`, so that the
 * XP table's shape stays an implementation detail of this rule and a future
 * version can hold a different number without any call site changing.
 */
export function regressionTestXp(version: ScoringVersion): number {
  return version.xp.verified_regression_test;
}