import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import {
  attributable,
  award,
  hasReference,
  keyFor,
  reject,
  xpFor,
  type ScoringRule,
} from "./rule";
import { SCORING_V1 } from "./types";

function event(over: Partial<DeveloperEvent> = {}): DeveloperEvent {
  return {
    id: "pull_request:1",
    kind: "pull_request",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-08T12:00:00Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: null,
    relevance: "scored",
    limitations: [],
    evidence: {
      number: 82,
      action: "merged",
      merged: true,
      headRef: "feature",
      baseRef: "main",
    },
    ...over,
  } as DeveloperEvent;
}

describe("attributable — §5 rule 3, §6", () => {
  it("accepts verified evidence", () => {
    expect(attributable(event())).toBe(true);
  });

  it("declines inferred evidence", () => {
    // Stricter than §6 requires, deliberately: §6 admits inferred only where a
    // rule "explicitly defined" its use, and none does.
    expect(attributable(event({ confidence: "inferred" }))).toBe(false);
  });
});

describe("hasReference — §8 stable source", () => {
  it("accepts a number and a non-empty string", () => {
    expect(hasReference(82)).toBe(true);
    expect(hasReference("v2.0.0")).toBe(true);
  });

  it("declines null", () => {
    expect(hasReference(null)).toBe(false);
  });

  it("accepts zero, which is a legitimate number", () => {
    // Not a truthiness check: 0 is a real value, only absence is disqualifying.
    expect(hasReference(0)).toBe(true);
  });
});

describe("award", () => {
  it("attaches the event and rule identity to every attribute award", () => {
    const result = award({
      event: event(),
      version: SCORING_V1,
      ruleId: "pr.merged",
      classification: "merged_pull_request",
      xp: 30,
      reason: "Merged",
      attributes: [
        { attribute: "builder", amount: 1 },
        { attribute: "architect", amount: 1 },
      ],
    });

    expect(result.attributeAwards).toEqual([
      { attribute: "builder", amount: 1, eventId: "pull_request:1", ruleId: "pr.merged" },
      { attribute: "architect", amount: 1, eventId: "pull_request:1", ruleId: "pr.merged" },
    ]);
  });

  it("produces an eligible result with no rejection reason", () => {
    const result = award({
      event: event(),
      version: SCORING_V1,
      ruleId: "pr.merged",
      classification: "merged_pull_request",
      xp: 30,
      reason: "Merged",
      attributes: [],
    });

    expect(result.eligible).toBe(true);
    expect(result.rejectionReason).toBeUndefined();
  });

  it("carries the version it was given", () => {
    const result = award({
      event: event(),
      version: SCORING_V1,
      ruleId: "r",
      classification: "merged_pull_request",
      xp: 1,
      reason: "x",
      attributes: [],
    });

    expect(result.scoringVersion).toBe(SCORING_V1.id);
  });

  it("handles an award with no attribute impact", () => {
    // §15 keeps the axes separate, so an XP-only award is legitimate.
    const result = award({
      event: event(),
      version: SCORING_V1,
      ruleId: "r",
      classification: "merged_pull_request",
      xp: 30,
      reason: "x",
      attributes: [],
    });

    expect(result.attributeAwards).toEqual([]);
    expect(result.xp).toBe(30);
  });
});

describe("reject", () => {
  it("awards nothing and always says why", () => {
    const result = reject({
      event: event(),
      version: SCORING_V1,
      reason: "Not merged",
      rejectionReason: "not_qualifying",
    });

    expect(result).toMatchObject({
      eligible: false,
      xp: 0,
      attributeAwards: [],
      rejectionReason: "not_qualifying",
      reason: "Not merged",
    });
  });

  it("defaults the classification to null when none was recognised", () => {
    const result = reject({
      event: event(),
      version: SCORING_V1,
      reason: "x",
      rejectionReason: "invalid_event",
    });

    expect(result.classification).toBeNull();
  });

  it("keeps a recognised classification", () => {
    const result = reject({
      event: event(),
      version: SCORING_V1,
      reason: "x",
      rejectionReason: "not_qualifying",
      classification: "merged_pull_request",
    });

    expect(result.classification).toBe("merged_pull_request");
  });
});

describe("xpFor — §4 values", () => {
  it("returns the version's value for a classification", () => {
    expect(xpFor(SCORING_V1, "merged_pull_request")).toBe(30);
    expect(xpFor(SCORING_V1, "completed_review")).toBe(15);
    expect(xpFor(SCORING_V1, "linked_issue_closure")).toBe(20);
    expect(xpFor(SCORING_V1, "release")).toBe(25);
    expect(xpFor(SCORING_V1, "qualifying_documentation")).toBe(10);
    expect(xpFor(SCORING_V1, "verified_regression_test")).toBe(12);
  });

  it("returns null, not zero, for a classification the version cannot value", () => {
    // qualifying_commit is null because commit volume is not observable from the
    // events feed (TASKS 4.4). null keeps "undefined" distinct from "worthless".
    expect(xpFor(SCORING_V1, "qualifying_commit")).toBeNull();
  });
});

describe("keyFor — §18", () => {
  it("builds the documented key from the event", () => {
    expect(keyFor(event({ id: "push:1", developerLogin: "octocat" }), SCORING_V1)).toBe(
      "xp:octocat:push:1:scoring-v1",
    );
  });

  it("is stable across calls, so repeated processing collides by design", () => {
    const target = event();

    expect(keyFor(target, SCORING_V1)).toBe(keyFor(target, SCORING_V1));
  });

  it("differs per developer and per event", () => {
    expect(keyFor(event(), SCORING_V1)).not.toBe(
      keyFor(event({ developerLogin: "someone-else" }), SCORING_V1),
    );
    expect(keyFor(event(), SCORING_V1)).not.toBe(
      keyFor(event({ id: "pull_request:2" }), SCORING_V1),
    );
  });
});

describe("ScoringRule contract", () => {
  it("allows a rule to decline an event it does not handle", () => {
    const rule: ScoringRule = {
      ruleId: "test.rule",
      evaluate: (e) => (e.kind === "release" ? null : reject({
        event: e,
        version: SCORING_V1,
        reason: "x",
        rejectionReason: "unsupported_event",
      })),
    };

    expect(rule.evaluate(event(), SCORING_V1)).not.toBeNull();
  });
});
