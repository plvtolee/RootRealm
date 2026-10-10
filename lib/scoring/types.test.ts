import { describe, expect, it } from "vitest";

import {
  ATTRIBUTES,
  SCORING_V1,
  SCORING_VERSIONS,
  emptyAttributeTally,
  idempotencyKey,
  ineligibleResult,
  type Attribute,
  type AttributeAward,
  type RejectionReason,
  type ScoreResult,
  type ScoringClassification,
  type ScoringVersionId,
  type XPTransaction,
} from "./types";

const ATTRIBUTE_NAMES: Attribute[] = [
  "builder",
  "debugger",
  "scholar",
  "collaborator",
  "maintainer",
  "architect",
];

const CLASSIFICATIONS: ScoringClassification[] = [
  "qualifying_commit",
  "merged_pull_request",
  "completed_review",
  "linked_issue_closure",
  "release",
  "qualifying_documentation",
  "verified_regression_test",
];

const REJECTIONS: RejectionReason[] = [
  "duplicate_event",
  "invalid_event",
  "insufficient_evidence",
  "not_attributable",
  "not_qualifying",
  "already_rewarded",
  "outside_scoring_scope",
  "anti_farming_rule",
  "unsupported_event",
];

/* -------------------------------------------------------------------------- */

describe("attributes", () => {
  it("lists exactly the six from SCORING.md §14", () => {
    expect([...ATTRIBUTES].sort()).toEqual([...ATTRIBUTE_NAMES].sort());
  });

  it("has no duplicates", () => {
    expect(new Set(ATTRIBUTES).size).toBe(ATTRIBUTES.length);
  });

  it("uses the lower-cased persisted keys the spec names", () => {
    // §16 spells them lower-case; presentation casing belongs to the UI.
    for (const attribute of ATTRIBUTES) {
      expect(attribute).toBe(attribute.toLowerCase());
    }
  });

  it("initialises every attribute to zero, never omitting one", () => {
    const tally = emptyAttributeTally();

    expect(Object.keys(tally).sort()).toEqual([...ATTRIBUTE_NAMES].sort());
    expect(Object.values(tally).every((value) => value === 0)).toBe(true);
  });
});

describe("classification and rejection vocabularies", () => {
  it("covers every §4 XP value with a classification", () => {
    const tableKeys = Object.keys(SCORING_V1.xp);

    expect(tableKeys.sort()).toEqual([...CLASSIFICATIONS].sort());
  });

  it("uses the lower-cased §17 vocabulary", () => {
    for (const classification of CLASSIFICATIONS) {
      expect(classification).toBe(classification.toLowerCase());
    }
  });

  it("mirrors the §35 rejection list", () => {
    // §35 lists these as machine-readable, so the union must be the whole list.
    expect(REJECTIONS).toHaveLength(9);
    expect(REJECTIONS).toContain("not_attributable");
    expect(REJECTIONS).toContain("insufficient_evidence");
  });
});

describe("scoring version — §4 starting values", () => {
  it("carries the values the spec states", () => {
    expect(SCORING_V1.xp).toEqual({
      qualifying_commit: null,
      merged_pull_request: 30,
      completed_review: 15,
      linked_issue_closure: 20,
      release: 25,
      qualifying_documentation: 10,
      verified_regression_test: 12,
    });
  });

  it("declares commits unscorable rather than inventing a per-commit value", () => {
    // TASKS 4.4 verified that a PushEvent carries no commit list, so a per-commit
    // award is not computable from the activity feed. A number here would invite
    // TASKS 5.2 to multiply by a count that does not exist.
    expect(SCORING_V1.xp.qualifying_commit).toBeNull();
  });

  it("awards whole integers only", () => {
    for (const value of Object.values(SCORING_V1.xp)) {
      if (value === null) continue;
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("keeps its own values, so tuning cannot rewrite history", () => {
    // §3: changing values for future activity must not silently rewrite
    // historical transactions. The table travelling with the version is what
    // makes an old ledger entry re-explainable.
    const original = SCORING_V1.xp.merged_pull_request;
    const pinned: ScoringVersionId = SCORING_V1.id;

    expect(SCORING_VERSIONS[pinned].xp.merged_pull_request).toBe(original);
  });

  it("is reachable by its own id", () => {
    expect(SCORING_VERSIONS[SCORING_V1.id]).toBe(SCORING_V1);
  });

  it("notes that the values are placeholders", () => {
    // §4 is explicit that these are not final balance values.
    expect(SCORING_V1.notes?.toLowerCase()).toContain("placeholder");
  });
});

describe("idempotencyKey — §18", () => {
  it("matches the documented shape", () => {
    // xp:user123:event456:scoring-v1
    expect(idempotencyKey("user123", "event456", "scoring-v1")).toBe(
      "xp:user123:event456:scoring-v1",
    );
  });

  it("is stable across repeated calls", () => {
    expect(idempotencyKey("octocat", "push:1", "scoring-v1")).toBe(
      idempotencyKey("octocat", "push:1", "scoring-v1"),
    );
  });

  it("distinguishes developers who saw the same event id", () => {
    expect(idempotencyKey("octocat", "push:1", "scoring-v1")).not.toBe(
      idempotencyKey("sindresorhus", "push:1", "scoring-v1"),
    );
  });

  it("distinguishes versions, so a rescore may award again", () => {
    // §18 scopes the key by version precisely so a scoring change is not read as
    // a duplicate of the older scoring.
    const key = idempotencyKey("octocat", "push:1", "scoring-v1");

    expect(key.endsWith(":scoring-v1")).toBe(true);
  });

  it("distinguishes kinds, which the event id already encodes", () => {
    expect(idempotencyKey("octocat", "push:1", "scoring-v1")).not.toBe(
      idempotencyKey("octocat", "review:1", "scoring-v1"),
    );
  });
});

describe("ineligibleResult", () => {
  it("awards nothing and always explains why", () => {
    const result = ineligibleResult(
      "push:1",
      "scoring-v1",
      "The repository is not attributable to this developer.",
      "not_attributable",
    );

    expect(result).toMatchObject({
      eventId: "push:1",
      eligible: false,
      xp: 0,
      attributeAwards: [],
      scoringVersion: "scoring-v1",
      rejectionReason: "not_attributable",
    });
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("can name the classification it recognised but did not award", () => {
    // Knowing an event was recognised but failed to qualify is part of
    // explaining it (§17), so classification is not cleared on rejection.
    const result = ineligibleResult(
      "pull_request:1",
      "scoring-v1",
      "The pull request was closed without merging.",
      "not_qualifying",
      "merged_pull_request",
    );

    expect(result.classification).toBe("merged_pull_request");
    expect(result.eligible).toBe(false);
  });

  it("shapes every rejection identically", () => {
    const results = REJECTIONS.map((reason) =>
      ineligibleResult("e", "scoring-v1", "why", reason),
    );

    for (const result of results) {
      expect(result.xp).toBe(0);
      expect(result.eligible).toBe(false);
      expect(result.attributeAwards).toEqual([]);
    }
  });
});

describe("type contracts", () => {
  it("keeps XP and attribute units on separate axes", () => {
    // §15/§16: attribute units evolve independently of the XP balance, so an
    // AttributeAward must not carry an XP figure.
    const award: AttributeAward = {
      attribute: "builder",
      amount: 1,
      eventId: "pull_request:42",
      ruleId: "pr.merged",
    };

    expect(award).not.toHaveProperty("xp");
    expect(Object.keys(award).sort()).toEqual([
      "amount",
      "attribute",
      "eventId",
      "ruleId",
    ]);
  });

  it("satisfies §34 for a scored result", () => {
    const result: ScoreResult = {
      eventId: "pull_request:42",
      eligible: true,
      xp: 30,
      classification: "merged_pull_request",
      reason: "Merged implementation pull request",
      attributeAwards: [
        {
          attribute: "builder",
          amount: 1,
          eventId: "pull_request:42",
          ruleId: "pr.merged",
        },
      ],
      scoringVersion: "scoring-v1",
    };

    expect(result.eligible).toBe(true);
    expect(result.rejectionReason).toBeUndefined();
  });

  it("carries every §17 ledger field on a transaction", () => {
    const transaction: XPTransaction = {
      id: idempotencyKey("octocat", "pull_request:42", "scoring-v1"),
      eventId: "pull_request:42",
      developerLogin: "octocat",
      xp: 30,
      classification: "merged_pull_request",
      reason: "Merged implementation pull request",
      ruleId: "pr.merged",
      attributeAwards: [
        {
          attribute: "builder",
          amount: 1,
          eventId: "pull_request:42",
          ruleId: "pr.merged",
        },
      ],
      scoringVersion: "scoring-v1",
      sourceUrl: "https://github.com/octocat/octo-repo/pull/42",
      awardedAt: "2026-10-11T00:00:00Z",
    };

    // §17: event, classification, XP, attribute impact, reason, version, source.
    for (const field of [
      "eventId",
      "classification",
      "xp",
      "attributeAwards",
      "reason",
      "scoringVersion",
      "sourceUrl",
    ] as const) {
      expect(transaction[field]).toBeDefined();
    }
  });

  it("persists without transformation", () => {
    // TASKS 10.2 makes this a table row, so it must survive JSON unchanged.
    const transaction: XPTransaction = {
      id: "xp:octocat:push:1:scoring-v1",
      eventId: "push:1",
      developerLogin: "octocat",
      xp: 3,
      classification: "qualifying_commit",
      reason: "Qualifying commit",
      ruleId: "commit.qualifying",
      attributeAwards: [],
      scoringVersion: "scoring-v1",
      sourceUrl: null,
      awardedAt: "2026-10-11T00:00:00Z",
    };

    expect(JSON.parse(JSON.stringify(transaction))).toEqual(transaction);
  });
});
