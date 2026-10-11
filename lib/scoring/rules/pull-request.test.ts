import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../../developer-event";
import { pullRequestRule, RULE_ID } from "./pull-request";
import { SCORING_V1 } from "../types";

/**
 * A canonical pull request event as TASKS 4.5 produces it, so the rule is
 * exercised against the real shape including the undecidable `merged` cases.
 */
function pr(
  over: {
    merged?: boolean | null;
    action?: string | null;
    number?: number | null;
    confidence?: "verified" | "inferred";
    id?: string;
    testFiles?: string[] | null;
  } = {},
): DeveloperEvent {
  const merged = over.merged === undefined ? true : over.merged;

  return {
    id: over.id ?? "pull_request:16855873910",
    kind: "pull_request",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-08T12:00:00Z",
    visibility: "public",
    confidence: over.confidence ?? "verified",
    sourceUrl: "https://github.com/octocat/octo-repo/pull/82",
    relevance: "scored",
    limitations: [],
    evidence: {
      number: over.number === undefined ? 82 : over.number,
      action: over.action === undefined ? "merged" : over.action,
      merged,
      headRef: "feature",
      baseRef: "main",
      testFiles: over.testFiles ?? null,
    },
  } as DeveloperEvent;
}

/** A non-PR event, to prove the rule declines rather than mis-scores. */
function push(): DeveloperEvent {
  return {
    id: "push:1",
    kind: "push",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-09T05:51:24Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: null,
    relevance: "scored",
    limitations: ["commit_count_unavailable"],
    evidence: { branch: "main", headSha: "abc", beforeSha: "def", pushId: "1" },
  } as DeveloperEvent;
}

const score = (event: DeveloperEvent) => pullRequestRule.evaluate(event, SCORING_V1);

/* -------------------------------------------------------------------------- */

describe("pullRequestRule â€” applicability", () => {
  it("declines an event that is not a pull request", () => {
    // null means "not my concern", which is distinct from an ineligible result.
    expect(score(push())).toBeNull();
  });

  it("identifies itself with a stable rule id", () => {
    expect(pullRequestRule.ruleId).toBe("pr.merged");
    expect(score(pr())?.attributeAwards[0].ruleId).toBe(RULE_ID);
  });
});

describe("pullRequestRule â€” the merged case (Â§8)", () => {
  it("awards the Â§4 value", () => {
    const result = score(pr());

    expect(result?.eligible).toBe(true);
    expect(result?.xp).toBe(30);
    expect(result?.classification).toBe("merged_pull_request");
  });

  it("explains itself in the Â§17 vocabulary", () => {
    const result = score(pr());

    expect(result?.reason).toBe("Merged implementation pull request");
  });

  it("awards Builder, its primary attribute (Â§14)", () => {
    const awards = score(pr())?.attributeAwards ?? [];

    expect(awards).toHaveLength(1);
    expect(awards[0]).toMatchObject({
      attribute: "builder",
      amount: 1,
      eventId: "pull_request:16855873910",
    });
  });

  it("invents no other attribute, since Â§8 defers those to separate rules", () => {
    const attributes = (score(pr())?.attributeAwards ?? []).map((a) => a.attribute);

    expect(attributes).toEqual(["builder"]);
  });

  it("stamps the scoring version that produced the award (Â§3)", () => {
    expect(score(pr())?.scoringVersion).toBe("scoring-v1");
  });

  it("does not award on size, which the payload cannot report", () => {
    // The stub has no additions/deletions/changed_files, so two merged PRs of
    // wildly different size score identically. That is the intended behaviour.
    const small = score(pr({ id: "pull_request:1" }));
    const large = score(pr({ id: "pull_request:2" }));

    expect(small?.xp).toBe(large?.xp);
  });
});

describe("pullRequestRule â€” the undecidable merge (Â§8, TASKS 4.4)", () => {
  it("declines a closed pull request as insufficient evidence, not as unmerged", () => {
    // `merged: null` is the `closed` action: GitHub does not say whether the
    // closure was a merge. Flattening it to false would assert something we
    // cannot know.
    const result = score(pr({ action: "closed", merged: null }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("insufficient_evidence");
    expect(result?.xp).toBe(0);
  });

  it("still names the classification it recognised", () => {
    const result = score(pr({ action: "closed", merged: null }));

    expect(result?.classification).toBe("merged_pull_request");
  });

  it("declines a known non-merge as not qualifying", () => {
    const result = score(pr({ action: "closed", merged: false }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("not_qualifying");
  });

  it("separates declined evidence from missing evidence", () => {
    // The distinction Â§35 names two different reasons for.
    const unknown = score(pr({ action: "closed", merged: null }));
    const unmerged = score(pr({ action: "closed", merged: false }));

    expect(unknown?.rejectionReason).not.toBe(unmerged?.rejectionReason);
  });

  it("does not award an opened pull request", () => {
    const result = score(pr({ action: "opened", merged: false }));

    expect(result?.eligible).toBe(false);
  });
});

describe("pullRequestRule â€” attribution (Â§5 rule 3, Â§6)", () => {
  it("declines an event that is not attributable to the developer", () => {
    const result = score(pr({ confidence: "inferred" }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("not_attributable");
    expect(result?.xp).toBe(0);
  });

  it("awards no attributes when rejected", () => {
    expect(score(pr({ confidence: "inferred" }))?.attributeAwards).toEqual([]);
  });

  it("does not award inferred evidence the same treatment as verified", () => {
    // Â§6: "Do not silently treat inferred data as verified."
    expect(score(pr({ confidence: "inferred" }))?.xp).not.toBe(
      score(pr())?.xp,
    );
  });
});

describe("pullRequestRule â€” stable source (Â§8)", () => {
  it("declines a pull request with no number", () => {
    const result = score(pr({ number: null }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("insufficient_evidence");
  });

  it("checks the reference before the merge state", () => {
    // Order matters only for which reason is reported; a PR that is both
    // unciteable and unmerged should still be reported as unciteable.
    const result = score(pr({ number: null, action: "closed", merged: false }));

    expect(result?.rejectionReason).toBe("insufficient_evidence");
  });
});

describe("pullRequestRule â€” purity (Â§5.11)", () => {
  it("returns the same result for the same input", () => {
    const event = pr();

    expect(score(event)).toEqual(score(event));
  });

  it("does not mutate the event", () => {
    const event = pr();
    const before = JSON.stringify(event);

    score(event);

    expect(JSON.stringify(event)).toBe(before);
  });

  // "stamps the version it was given" is not tested here: ScoringVersionId is a
  // closed union with a single member, so a test could only assert the value it
  // passed. It becomes meaningful when a second version exists (TASKS 5.13).
});

/* -------------------------------------------------------------------------- */
/* TASKS 5.8 — §13 regression test, folded into the same award                  */
/* -------------------------------------------------------------------------- */

/*
 * §33 returns one ScoreResult per event and §18's idempotency key is scoped to
 * the event, so a merged pull request carrying a test is one transaction spanning
 * two §4 lines rather than two transactions. These assert the composition, since
 * it is what makes the award explainable rather than an unexplained total.
 */

describe("§13 regression test, composed into the merge award", () => {
  const withTest = (testFiles: string[] | null) =>
    score(pr({ testFiles }))!;

  it("adds §13's line when a merged pull request touched a test", () => {
    const result = withTest(["internal/auth_test.go"]);

    expect(result.eligible).toBe(true);
    expect(result.xp).toBe(30 + 12);
  });

  it("names both lines, so +42 is explainable rather than a mystery", () => {
    expect(withTest(["internal/auth_test.go"]).breakdown).toEqual([
      { classification: "merged_pull_request", ruleId: "pr.merged", xp: 30 },
      {
        classification: "verified_regression_test",
        ruleId: "pr.regression_test",
        xp: 12,
      },
    ]);
  });

  it("attributes each line's units to the rule that earned them", () => {
    // A Debugger point must be traceable to the test, not folded indistinguishably
    // into the Builder points from the merge.
    const result = withTest(["internal/auth_test.go"]);

    expect(result.attributeAwards).toEqual([
      { attribute: "builder", amount: 1, eventId: result.eventId, ruleId: "pr.merged" },
      {
        attribute: "debugger",
        amount: 1,
        eventId: result.eventId,
        ruleId: "pr.regression_test",
      },
    ]);
  });

  it("says in its reason that a regression test was included", () => {
    expect(withTest(["a_test.go"]).reason).toContain("regression test");
  });

  it("adds nothing when no test file was touched", () => {
    const result = withTest(["src/auth.go"]);

    expect(result.xp).toBe(30);
    // Absent rather than a one-entry restatement of xp and classification.
    expect(result.breakdown).toBeUndefined();
    expect(result.reason).toBe("Merged implementation pull request");
  });

  it("adds nothing while test files have never been fetched", () => {
    // The state every pull request is in until ingestion supplies filenames. The
    // merge still pays; only §13's additional line is withheld.
    const result = withTest(null);

    expect(result.xp).toBe(30);
    expect(result.breakdown).toBeUndefined();
  });

  it("adds nothing for an ambiguous test-shaped file", () => {
    expect(withTest(["tests/helpers.ts"]).xp).toBe(30);
  });

  it("does not attach the test line when the merge itself was declined", () => {
    const result = score(pr({ merged: false, action: "closed", testFiles: ["a_test.go"] }))!;

    expect(result.eligible).toBe(false);
    expect(result.xp).toBe(0);
  });

  it("awards once regardless of how many tests were added", () => {
    // §13 gives a flat value with no per-file multiplier, and §20 forbids
    // optimizing for volume.
    const one = withTest(["pkg/auth_test.go"]);
    const many = withTest(
      Array.from({ length: 20 }, (_unused, i) => `pkg/case_${i}_test.go`),
    );

    expect(many.xp).toBe(one.xp);
    expect(many.attributeAwards).toHaveLength(one.attributeAwards.length);
  });
});
