import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../../developer-event";
import { reviewRule, RULE_ID } from "./review";
import { SCORING_V1 } from "../types";

function review(over: {
  subject?: "review" | "comment";
  state?: string | null;
  number?: number | null;
  confidence?: "verified" | "inferred";
  id?: string;
} = {}): DeveloperEvent {
  return {
    id: over.id ?? "review:16855873910",
    kind: "review",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-08T11:00:00Z",
    visibility: "public",
    confidence: over.confidence ?? "verified",
    sourceUrl: "https://github.com/octocat/octo-repo/pull/82",
    relevance: "scored",
    limitations: [],
    evidence: {
      number: over.number === undefined ? 82 : over.number,
      state: over.state === undefined ? "approved" : over.state,
      subject: over.subject ?? "review",
    },
  } as DeveloperEvent;
}

const score = (event: DeveloperEvent) => reviewRule.evaluate(event, SCORING_V1);

/* -------------------------------------------------------------------------- */

describe("reviewRule — applicability", () => {
  it("declines an event that is not a review", () => {
    const notReview = { ...review(), kind: "release" } as DeveloperEvent;

    expect(score(notReview)).toBeNull();
  });

  it("identifies itself with a stable rule id", () => {
    expect(reviewRule.ruleId).toBe("review.completed");
    expect(score(review())?.attributeAwards[0].ruleId).toBe(RULE_ID);
  });
});

describe("reviewRule — the completed review (§9)", () => {
  it("awards the §4 value", () => {
    expect(score(review())).toMatchObject({
      eligible: true,
      xp: 15,
      classification: "completed_review",
    });
  });

  it("awards Collaborator, its primary attribute (§9, §14)", () => {
    const awards = score(review())?.attributeAwards ?? [];

    expect(awards).toHaveLength(1);
    expect(awards[0].attribute).toBe("collaborator");
  });

  it("awards no attribute §9 did not define", () => {
    // §9: reviews "may contribute to other attributes only if explicitly
    // defined" — and none is.
    const attributes = (score(review())?.attributeAwards ?? []).map((a) => a.attribute);

    expect(attributes).toEqual(["collaborator"]);
  });

  it.each(["approved", "changes_requested", "commented"])(
    "qualifies a %s review",
    (state) => {
      expect(score(review({ state }))?.eligible).toBe(true);
    },
  );

  it("accepts a state in any casing, since GitHub has varied it", () => {
    expect(score(review({ state: "APPROVED" }))?.eligible).toBe(true);
  });
});

describe("reviewRule — a comment is not a completed review (§9)", () => {
  it("declines a review comment", () => {
    const result = score(review({ subject: "comment" }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("not_qualifying");
  });

  it("declines it before inspecting the state", () => {
    // An approved-looking comment is still a comment; the subject decides.
    const result = score(review({ subject: "comment", state: "approved" }));

    expect(result?.eligible).toBe(false);
  });

  it("still names what it recognised", () => {
    expect(score(review({ subject: "comment" }))?.classification).toBe(
      "completed_review",
    );
  });
});

describe("reviewRule — states that are not completed", () => {
  it("declines a dismissed review as not qualifying", () => {
    const result = score(review({ state: "dismissed" }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("not_qualifying");
  });

  it("declines a pending review, which was never submitted", () => {
    expect(score(review({ state: "pending" }))?.eligible).toBe(false);
  });

  it("separates an unknown state from a known non-qualifying one", () => {
    // No state is missing evidence; a dismissed state is declined evidence.
    const unknown = score(review({ state: null }));
    const dismissed = score(review({ state: "dismissed" }));

    expect(unknown?.rejectionReason).toBe("insufficient_evidence");
    expect(dismissed?.rejectionReason).toBe("not_qualifying");
  });
});

describe("reviewRule — attribution and source", () => {
  it("declines an unattributable review", () => {
    const result = score(review({ confidence: "inferred" }));

    expect(result?.rejectionReason).toBe("not_attributable");
    expect(result?.xp).toBe(0);
  });

  it("declines a review with no pull request number", () => {
    expect(score(review({ number: null }))?.rejectionReason).toBe(
      "insufficient_evidence",
    );
  });
});

describe("reviewRule — purity", () => {
  it("is deterministic", () => {
    const event = review();

    expect(score(event)).toEqual(score(event));
  });

  it("does not mutate the event", () => {
    const event = review();
    const before = JSON.stringify(event);

    score(event);

    expect(JSON.stringify(event)).toBe(before);
  });
});
