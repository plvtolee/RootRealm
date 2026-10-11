import { describe, expect, it } from "vitest";

import type { DeveloperEvent, PullRequestEvidence } from "../../developer-event";
import { attributeUnitsFor } from "../attributes";
import { detectTestCoverage } from "../test-detection";
import { SCORING_V1 } from "../types";
import {
  RULE_ID,
  additionalRegressionTestAward,
  regressionTestGrade,
  regressionTestXp,
  testFilesUnavailable,
} from "./regression-test";

function evidence(
  over: Partial<PullRequestEvidence> = {},
): PullRequestEvidence {
  return {
    number: 82,
    action: "merged",
    merged: true,
    headRef: "feature",
    baseRef: "main",
    testFiles: null,
    ...over,
  };
}

function event(over: Partial<DeveloperEvent> = {}): DeveloperEvent {
  return {
    id: "pull_request:42",
    kind: "pull_request",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-08T12:00:00Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: "https://github.com/octocat/octo-repo/pull/82",
    relevance: "scored",
    limitations: ["diff_stats_unavailable"],
    evidence: evidence(),
    ...over,
  } as DeveloperEvent;
}

const awardFor = (over: Partial<PullRequestEvidence> = {}) =>
  additionalRegressionTestAward(evidence(over), regressionTestXp(SCORING_V1));

/* -------------------------------------------------------------------------- */

describe("the §13 value", () => {
  it("comes from the scoring version, not a local constant", () => {
    expect(regressionTestXp(SCORING_V1)).toBe(12);
  });

  it("sits below the merge it accompanies", () => {
    // A regression test is additional recognition inside real shipped work, not
    // the bulk of it. §4's own ordering must hold or the composition inverts.
    expect(regressionTestXp(SCORING_V1)).toBeLessThan(
      SCORING_V1.xp.merged_pull_request,
    );
  });
});

describe("regressionTestGrade — strong only", () => {
  it("reports strong for a conventional test file", () => {
    expect(regressionTestGrade(evidence({ testFiles: ["internal/auth_test.go"] }))).toBe(
      "strong",
    );
  });

  it("reports nothing for an ambiguous file, which must not pay", () => {
    // `weak` is a real grade the classifier can return; this rule must not award
    // on it. §13 says "verified", and a shared helper is not a verified test.
    expect(regressionTestGrade(evidence({ testFiles: ["tests/helpers.ts"] }))).toBeNull();
  });

  it("reports nothing when files were fetched and none were tests", () => {
    expect(regressionTestGrade(evidence({ testFiles: ["src/auth.go"] }))).toBeNull();
    expect(regressionTestGrade(evidence({ testFiles: [] }))).toBeNull();
  });

  it("cannot answer when files were never fetched", () => {
    // `null` is unknown, not false. The distinction is the whole point of the
    // tri-state field: a fetch failure must not read as "no tests here".
    expect(regressionTestGrade(evidence({ testFiles: null }))).toBeNull();
  });

  it("reports nothing for a fixture that happens to be named like a test", () => {
    expect(
      regressionTestGrade(evidence({ testFiles: ["docs/auth_test.md"] })),
    ).toBeNull();
  });

  it("agrees with the classifier it delegates to", () => {
    // Asserting the two separately would let a future change to one silently
    // disagree with the other.
    const files = ["internal/auth_test.go", "src/auth.go"];
    const grade = detectTestCoverage(
      files.map((filename) => ({ filename, status: "added" })),
    );

    expect(regressionTestGrade(evidence({ testFiles: files }))).toBe(
      grade.grade === "strong" ? "strong" : null,
    );
  });
});

describe("additionalRegressionTestAward — what qualifies", () => {
  it("awards §13's line for a merged pull request with a test", () => {
    const award = awardFor({ testFiles: ["internal/auth_test.go"] });

    expect(award).not.toBeNull();
    expect(award?.classification).toBe("verified_regression_test");
    expect(award?.xp).toBe(12);
    expect(award?.ruleId).toBe(RULE_ID);
  });

  it("awards one Debugger unit (§13 names Debugger)", () => {
    expect(awardFor({ testFiles: ["internal/auth_test.go"] })?.attributes).toEqual([
      { attribute: "debugger", amount: 1 },
    ]);
  });

  it("resolves its attribute through the central table", () => {
    // 5.9's guarantee is that an attribute is decided in one place.
    expect(awardFor({ testFiles: ["a_test.go"] })?.attributes).toEqual(
      attributeUnitsFor("verified_regression_test"),
    );
  });

  it("declines when the pull request was never merged", () => {
    // An unmerged test has prevented nothing. §13 is about coverage that protects
    // a fix, and a closed pull request protects nothing.
    expect(awardFor({ merged: false, testFiles: ["a_test.go"] })).toBeNull();
  });

  it("declines when the merge status is undecidable", () => {
    expect(awardFor({ merged: null, testFiles: ["a_test.go"] })).toBeNull();
  });

  it("declines when no test file was touched", () => {
    expect(awardFor({ testFiles: ["src/auth.go"] })).toBeNull();
  });

  it("declines when the evidence was never fetched, and that is not a rejection of the work", () => {
    // Every pull request is in this state until TASKS 5.8's ingestion task lands.
    // The rule must return null rather than guess from an empty file list.
    expect(awardFor({ testFiles: null })).toBeNull();
  });

  it("awards once regardless of how many test files were added", () => {
    // §13 gives a flat value with no per-file multiplier, and §20 forbids
    // optimizing for volume. One award either way, or a hundred trivial tests
    // would out-earn the fix itself.
    const many = awardFor({
      testFiles: Array.from({ length: 50 }, (_unused, i) => `pkg/case_${i}_test.go`),
    });
    const one = awardFor({ testFiles: ["pkg/auth_test.go"] });

    expect(many?.xp).toBe(one?.xp);
  });

  it("does not award for a test file that was deleted", () => {
    expect(awardFor({ testFiles: [] })).toBeNull();
  });
});

describe("the §13 limit this rule cannot overcome", () => {
  it("cannot verify the defect association, so it awards on merge plus test file", () => {
    // §13 asks for a test "associated with fixing or preventing a defect".
    // Establishing that needs the pull request's issue links, which come from the
    // timeline API and which nothing ingests. What is awardable is a merged pull
    // request that touched a test file — which is what this asserts, so the
    // narrower claim is the pinned one.
    const award = awardFor({ testFiles: ["internal/auth_test.go"] });

    expect(award).not.toBeNull();
    // No issue reference is required or claimed.
    expect(award).not.toHaveProperty("issueNumber");
  });

  it("does not award test-heavy work more than the fix it accompanies", () => {
    const award = awardFor({ testFiles: ["a_test.go"] });

    expect(award!.xp).toBeLessThan(SCORING_V1.xp.merged_pull_request);
  });
});

describe("testFilesUnavailable", () => {
  it("reports a pull request whose files were never fetched", () => {
    expect(
      testFilesUnavailable(
        event({ limitations: ["diff_stats_unavailable", "test_files_unavailable"] }),
      ),
    ).toBe(true);
  });

  it("does not rely on the evidence field alone", () => {
    // The limitation is what ingestion records; the evidence field is what the
    // rule reads. This asserts the two are checked independently, so a record
    // that has one without the other cannot misreport which question is open.
    expect(
      testFilesUnavailable(
        event({
          limitations: ["test_files_unavailable"],
          evidence: evidence({ testFiles: ["a_test.go"] }),
        }),
      ),
    ).toBe(true);
  });

  it("does not report one whose files were fetched", () => {
    expect(
      testFilesUnavailable(
        event({
          limitations: ["diff_stats_unavailable"],
          evidence: evidence({ testFiles: [] }),
        }),
      ),
    ).toBe(false);
  });

  it("does not report other kinds", () => {
    expect(testFilesUnavailable(event({ kind: "push" }))).toBe(false);
  });
});

describe("determinism", () => {
  it("returns the same award for the same evidence", () => {
    const ev = evidence({ testFiles: ["internal/auth_test.go"] });

    expect(additionalRegressionTestAward(ev, 12)).toEqual(
      additionalRegressionTestAward(ev, 12),
    );
  });
});