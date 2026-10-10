import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../../developer-event";
import { issueRule, RULE_ID } from "./issue";
import { SCORING_V1 } from "../types";

function issue(over: {
  action?: string | null;
  state?: string | null;
  authored?: boolean | null;
  number?: number | null;
  confidence?: "verified" | "inferred";
  id?: string;
  sourceUrl?: string | null;
} = {}): DeveloperEvent {
  return {
    id: over.id ?? "issue:16864290652",
    kind: "issue",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-08T09:00:00Z",
    visibility: "public",
    confidence: over.confidence ?? "verified",
    sourceUrl:
      over.sourceUrl === undefined
        ? "https://github.com/octocat/octo-repo/issues/12"
        : over.sourceUrl,
    relevance: "scored",
    limitations: [],
    evidence: {
      number: over.number === undefined ? 12 : over.number,
      title: "Crash on launch",
      state: over.state === undefined ? "closed" : over.state,
      action: over.action === undefined ? "closed" : over.action,
      authored: over.authored === undefined ? true : over.authored,
    },
  } as DeveloperEvent;
}

const score = (event: DeveloperEvent) => issueRule.evaluate(event, SCORING_V1);

/* -------------------------------------------------------------------------- */

describe("issueRule — applicability", () => {
  it("declines an event that is not an issue", () => {
    const notIssue = { ...issue(), kind: "release" } as DeveloperEvent;

    expect(score(notIssue)).toBeNull();
  });

  it("identifies itself with a stable rule id", () => {
    expect(issueRule.ruleId).toBe("issue.closed");
    expect(score(issue())?.attributeAwards[0].ruleId).toBe(RULE_ID);
  });
});

describe("issueRule — the closure (§10)", () => {
  it("awards the §4 value", () => {
    expect(score(issue())).toMatchObject({
      eligible: true,
      xp: 20,
      classification: "linked_issue_closure",
    });
  });

  it("awards exactly one attribute", () => {
    expect(score(issue())?.attributeAwards).toHaveLength(1);
  });

  it("keeps the source issue URL available for the ledger (§10)", () => {
    // "Where possible, retain the source issue URL" — carried on the event, so
    // the ledger inherits it.
    expect(issue().sourceUrl).toBe(
      "https://github.com/octocat/octo-repo/issues/12",
    );
    expect(score(issue())?.eligible).toBe(true);
  });
});

describe("issueRule — attribution of the closure (§14)", () => {
  it("maps closing your own issue to Debugger", () => {
    // §14: Debugger's primary evidence includes "linked bug fixes".
    const awards = score(issue({ authored: true }))?.attributeAwards ?? [];

    expect(awards[0].attribute).toBe("debugger");
    expect(score(issue({ authored: true }))?.reason).toContain("had opened");
  });

  it("maps closing someone else's issue to Maintainer", () => {
    // §14: Maintainer's primary evidence includes "issue triage".
    const awards = score(issue({ authored: false }))?.attributeAwards ?? [];

    expect(awards[0].attribute).toBe("maintainer");
    expect(score(issue({ authored: false }))?.reason).toContain("reported by");
  });

  it("does not award the same attribute for both acts", () => {
    // §14 gives no basis for crediting triage to Debugger or a self-fix to
    // stewardship, so the two must not collapse.
    const own = score(issue({ authored: true }))?.attributeAwards[0].attribute;
    const other = score(issue({ authored: false }))?.attributeAwards[0].attribute;

    expect(own).not.toBe(other);
  });

  it("declines when authorship is unknown rather than guessing an attribute", () => {
    // §10: "Do not award XP simply because the developer closed an arbitrary
    // issue without sufficient evidence."
    const result = score(issue({ authored: null }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("insufficient_evidence");
    expect(result?.attributeAwards).toEqual([]);
  });
});

describe("issueRule — only a closure qualifies (§10)", () => {
  it.each(["opened", "labeled", "assigned", "commented", "reopened"])(
    "declines a %s action",
    (action) => {
      expect(score(issue({ action }))?.eligible).toBe(false);
    },
  );

  it("declines a labelling event even when the issue is closed", () => {
    // The state says the issue is closed; the action says this event is not the
    // closure. Using the state would award for labelling a long-closed issue.
    const result = score(issue({ action: "labeled", state: "closed" }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("not_qualifying");
  });

  it("declines a null action as not qualifying", () => {
    expect(score(issue({ action: null }))?.rejectionReason).toBe("not_qualifying");
  });
});

describe("issueRule — attribution and source", () => {
  it("declines an unattributable closure", () => {
    const result = score(issue({ confidence: "inferred" }));

    expect(result?.rejectionReason).toBe("not_attributable");
    expect(result?.xp).toBe(0);
  });

  it("declines a closure with no issue number", () => {
    expect(score(issue({ number: null }))?.rejectionReason).toBe(
      "insufficient_evidence",
    );
  });

  it("checks attribution before authorship", () => {
    const result = score(issue({ confidence: "inferred", authored: null }));

    expect(result?.rejectionReason).toBe("not_attributable");
  });
});

describe("issueRule — purity", () => {
  it("is deterministic", () => {
    const event = issue();

    expect(score(event)).toEqual(score(event));
  });

  it("does not mutate the event", () => {
    const event = issue();
    const before = JSON.stringify(event);

    score(event);

    expect(JSON.stringify(event)).toBe(before);
  });
});
