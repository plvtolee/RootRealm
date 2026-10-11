import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import {
  countCompletedReviews,
  countLinkedIssueClosures,
  countMergedPullRequests,
  countPublishedReleases,
  countQualifyingDocumentation,
  countVerifiedRegressionTests,
  countLandedPushes,
  computeAllEvidence,
  evaluateRequirement,
  satisfiesRequirement,
} from "./evidence";

/* -------------------------------------------------------------------------- */
/* Test event builders                                                         */
/* -------------------------------------------------------------------------- */

function baseEvent(over: Partial<DeveloperEvent> = {}): DeveloperEvent {
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
    limitations: [],
    evidence: { branch: "main", headSha: "abc", beforeSha: "def" },
    ...over,
  } as DeveloperEvent;
}

function pr(
  over: {
    action?: string | null;
    merged?: boolean | null;
    testFiles?: string[] | null;
  } = {},
): DeveloperEvent {
  return baseEvent({
    kind: "pull_request",
    id: "pr:1",
    evidence: {
      number: 42,
      action: over.action ?? "merged",
      merged: over.merged ?? true,
      headRef: "feature",
      baseRef: "main",
      testFiles: over.testFiles ?? null,
    },
  });
}

function review(
  over: {
    state?: string | null;
    action?: string | null;
    subject?: "review" | "comment";
  } = {},
): DeveloperEvent {
  return baseEvent({
    kind: "review",
    id: "review:1",
    evidence: {
      number: 42,
      state: over.state ?? "approved",
      action: over.action ?? "created",
      subject: over.subject ?? "review",
    },
  });
}

function issue(
  over: {
    action?: string | null;
    authored?: boolean | null;
  } = {},
): DeveloperEvent {
  return baseEvent({
    kind: "issue",
    id: "issue:1",
    evidence: {
      number: 12,
      title: "Crash",
      state: over.action === "closed" ? "closed" : "open",
      action: over.action ?? "closed",
      authored: over.authored === undefined ? true : over.authored,
    },
  });
}

function release(
  over: {
    action?: string | null;
    draft?: boolean | null;
    prerelease?: boolean | null;
  } = {},
): DeveloperEvent {
  return baseEvent({
    kind: "release",
    id: "release:1",
    evidence: {
      tag: "v1.0.0",
      name: "One",
      action: over.action ?? "published",
      draft: over.draft ?? false,
      prerelease: over.prerelease ?? false,
    },
  });
}

function documentation(
  over: {
    pagesChanged?: number;
    pagesCreated?: number;
  } = {},
): DeveloperEvent {
  return baseEvent({
    kind: "documentation",
    id: "wiki:1",
    evidence: {
      pagesChanged: over.pagesChanged ?? 1,
      pagesCreated: over.pagesCreated ?? 1,
      page: "README",
    },
  });
}

function push(
  over: {
    headSha?: string | null;
    beforeSha?: string | null;
  } = {},
): DeveloperEvent {
  return baseEvent({
    kind: "push",
    id: "push:1",
    evidence: {
      branch: "main",
      headSha: over.headSha ?? "abc",
      beforeSha: over.beforeSha ?? "def",
    },
  });
}

/* -------------------------------------------------------------------------- */

describe("countMergedPullRequests", () => {
  it("counts a merged PR with the right action", () => {
    expect(countMergedPullRequests([pr()])).toBe(1);
  });

  it("does not count an opened PR", () => {
    expect(countMergedPullRequests([pr({ action: "opened" })])).toBe(0);
  });

  it("does not count a closed but unmerged PR", () => {
    expect(countMergedPullRequests([pr({ action: "closed", merged: false })])).toBe(0);
  });

  it("does not count a closed PR with unknown merge status", () => {
    expect(countMergedPullRequests([pr({ action: "closed", merged: null })])).toBe(0);
  });
});

describe("countCompletedReviews", () => {
  it("counts an approved review", () => {
    expect(countCompletedReviews([review()])).toBe(1);
  });

  it("does not count a changes_requested review", () => {
    expect(countCompletedReviews([review({ state: "changes_requested" })])).toBe(0);
  });

  it("does not count a dismissed review", () => {
    expect(countCompletedReviews([review({ action: "dismissed" })])).toBe(0);
  });

  it("does not count a comment (subject=comment)", () => {
    expect(countCompletedReviews([review({ subject: "comment" })])).toBe(0);
  });

  it("does not count an updated review", () => {
    expect(countCompletedReviews([review({ action: "updated" })])).toBe(0);
  });
});

describe("countLinkedIssueClosures", () => {
  it("counts a self-authored closure as authored", () => {
    const { total, authored, triaged } = countLinkedIssueClosures([issue()]);
    expect(total).toBe(1);
    expect(authored).toBe(1);
    expect(triaged).toBe(0);
  });

  it("counts a triage closure as triaged", () => {
    const { total, authored, triaged } = countLinkedIssueClosures([
      issue({ authored: false }),
    ]);
    expect(total).toBe(1);
    expect(authored).toBe(0);
    expect(triaged).toBe(1);
  });

  it("counts unknown authorship in total but neither split", () => {
    const { total, authored, triaged } = countLinkedIssueClosures([
      issue({ authored: null }),
    ]);
    expect(total).toBe(1);
    expect(authored).toBe(0);
    expect(triaged).toBe(0);
  });

  it("does not count an opened issue", () => {
    expect(countLinkedIssueClosures([issue({ action: "opened" })]).total).toBe(0);
  });

  it("does not count a labeled issue", () => {
    expect(countLinkedIssueClosures([issue({ action: "labeled" })]).total).toBe(0);
  });
});

describe("countPublishedReleases", () => {
  it("counts a published release", () => {
    expect(countPublishedReleases([release()])).toBe(1);
  });

  it("does not count a draft release", () => {
    expect(countPublishedReleases([release({ draft: true })])).toBe(0);
  });

  it("does not count a deleted release", () => {
    expect(countPublishedReleases([release({ action: "deleted" })])).toBe(0);
  });

  it("does not count an edited release", () => {
    expect(countPublishedReleases([release({ action: "edited" })])).toBe(0);
  });

  it("does not count an unpublished release", () => {
    expect(countPublishedReleases([release({ action: "unpublished" })])).toBe(0);
  });

  it("counts a prerelease as published", () => {
    expect(countPublishedReleases([release({ prerelease: true })])).toBe(1);
  });
});

describe("countQualifyingDocumentation", () => {
  it("counts a created page event", () => {
    expect(countQualifyingDocumentation([documentation({ pagesCreated: 1 })])).toBe(1);
  });

  it("does not count an edited page event", () => {
    expect(countQualifyingDocumentation([documentation({ pagesCreated: 0 })])).toBe(0);
  });

  it("does not count multiple edits", () => {
    expect(countQualifyingDocumentation([documentation({ pagesCreated: 0, pagesChanged: 5 })])).toBe(0);
  });

  it("counts multiple events each with created pages", () => {
    expect(
      countQualifyingDocumentation([
        documentation({ pagesCreated: 2 }),
        documentation({ pagesCreated: 1 }),
      ]),
    ).toBe(2);
  });
});

describe("countVerifiedRegressionTests", () => {
  it("counts a PR with test files", () => {
    expect(countVerifiedRegressionTests([pr({ testFiles: ["tests/test_a.py"] })])).toBe(1);
  });

  it("does not count a PR with no test files fetched", () => {
    expect(countVerifiedRegressionTests([pr({ testFiles: null })])).toBe(0);
  });

  it("does not count a PR with empty test file list", () => {
    expect(countVerifiedRegressionTests([pr({ testFiles: [] })])).toBe(0);
  });

  it("does not count a PR without the fetch having run", () => {
    expect(countVerifiedRegressionTests([pr()])).toBe(0);
  });

  it("does not count a non-PR event", () => {
    const events = [
      { ...pr({ testFiles: ["test.ts"] }), kind: "push" },
    ] as never;
    expect(countVerifiedRegressionTests(events)).toBe(0);
  });
});

describe("countLandedPushes", () => {
  it("counts a push that moved the branch tip", () => {
    expect(countLandedPushes([push()])).toBe(1);
  });

  it("does not count a no-op push (head === before)", () => {
    expect(countLandedPushes([push({ headSha: "abc", beforeSha: "abc" })])).toBe(0);
  });

  it("counts a push with missing beforeSha as landed", () => {
    expect(countLandedPushes([push({ beforeSha: null })])).toBe(1);
  });

  it("counts a push with missing headSha as landed", () => {
    expect(countLandedPushes([push({ headSha: null })])).toBe(1);
  });

  it("does not count a non-push event", () => {
    expect(countLandedPushes([{ ...push(), kind: "pull_request" }] as never)).toBe(0);
  });
});

describe("computeAllEvidence", () => {
  it("returns zero for an empty history", () => {
    const counts = computeAllEvidence([]);
    expect(counts.merged_pull_requests).toBe(0);
    expect(counts.completed_reviews).toBe(0);
  });

  it("aggregates a mixed history correctly", () => {
    const events = [
      pr(),
      pr({ action: "opened" }),
      review(),
      review({ action: "dismissed" }),
      issue(),
      issue({ authored: false }),
      release(),
      release({ draft: true }),
      documentation({ pagesCreated: 2 }),
      documentation({ pagesCreated: 0 }),
      pr({ testFiles: ["test_a.py"] }),
      pr({ testFiles: null }),
      push(),
      push({ headSha: "abc", beforeSha: "abc" }),
    ];

    const counts = computeAllEvidence(events);

    expect(counts.merged_pull_requests).toBe(3);
    expect(counts.completed_reviews).toBe(1);
    expect(counts.linked_issue_closures_total).toBe(2);
    expect(counts.linked_issue_closures_authored).toBe(1);
    expect(counts.linked_issue_closures_triaged).toBe(1);
    expect(counts.published_releases).toBe(1);
    expect(counts.qualifying_documentation).toBe(1);
    expect(counts.verified_regression_tests).toBe(1);
    expect(counts.landed_pushes).toBe(1);
  });
});

describe("evaluateRequirement", () => {
  const events = [
    pr(),
    pr({ action: "opened" }),
    review(),
    issue(),
    issue({ authored: false }),
    release(),
    documentation({ pagesCreated: 1 }),
    pr({ testFiles: ["test.ts"] }),
    push(),
    push({ headSha: "abc", beforeSha: "abc" }),
  ];

  it("returns the count for a matching requirement", () => {
    expect(evaluateRequirement({ kind: "merged_pull_requests", count: 1 }, events)).toBe(2);
    expect(evaluateRequirement({ kind: "completed_reviews", count: 1 }, events)).toBe(1);
    expect(evaluateRequirement({ kind: "linked_issue_closures", count: 2 }, events)).toBe(2);
    expect(evaluateRequirement({ kind: "published_releases", count: 1 }, events)).toBe(1);
    expect(evaluateRequirement({ kind: "qualifying_documentation", count: 1 }, events)).toBe(1);
    expect(evaluateRequirement({ kind: "verified_regression_tests", count: 1 }, events)).toBe(1);
    expect(evaluateRequirement({ kind: "landed_pushes", count: 1 }, events)).toBe(1);
  });

  it("returns zero for an attribute_units requirement", () => {
    expect(evaluateRequirement({ kind: "attribute_units", attribute: "builder", count: 3 }, events)).toBe(0);
  });
});

describe("satisfiesRequirement", () => {
  const events = [pr(), issue(), release(), documentation({ pagesCreated: 1 })];

  it("returns true when the count meets the requirement", () => {
    expect(satisfiesRequirement({ kind: "merged_pull_requests", count: 1 }, events)).toBe(true);
    expect(satisfiesRequirement({ kind: "linked_issue_closures", count: 1 }, events)).toBe(true);
  });

  it("returns false when the count is insufficient", () => {
    expect(satisfiesRequirement({ kind: "merged_pull_requests", count: 5 }, events)).toBe(false);
    expect(satisfiesRequirement({ kind: "published_releases", count: 2 }, events)).toBe(false);
  });

  it("returns false for attribute_units (handled by progress, not events)", () => {
    expect(satisfiesRequirement({ kind: "attribute_units", attribute: "builder", count: 5 }, events)).toBe(false);
  });
});

describe("edge cases and purity", () => {
  it("handles an empty event list", () => {
    expect(computeAllEvidence([])).toEqual({
      merged_pull_requests: 0,
      completed_reviews: 0,
      linked_issue_closures_total: 0,
      linked_issue_closures_authored: 0,
      linked_issue_closures_triaged: 0,
      published_releases: 0,
      qualifying_documentation: 0,
      verified_regression_tests: 0,
      landed_pushes: 0,
    });
  });

  it("does not mutate the input events", () => {
    const events = [pr(), issue(), push()];
    const before = JSON.stringify(events);
    computeAllEvidence(events);
    expect(JSON.stringify(events)).toBe(before);
  });

  it("is deterministic", () => {
    const events = [pr(), issue(), push()];
    expect(computeAllEvidence(events)).toEqual(computeAllEvidence(events));
  });

  it("returns zero for evidence kinds with no ingested events", () => {
    const events = [pr(), issue(), push()];
    const counts = computeAllEvidence(events);
    expect(counts.merged_pull_requests).toBeGreaterThan(0);
    expect(Object.keys(counts)).not.toContain("discussions");
  });
});