import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { ledgerEntriesFor, ledgerEntryFor } from "./ledger";

const AWARDED_AT = "2026-10-11T00:00:00Z";

function event(id: string, over: Partial<DeveloperEvent> = {}): DeveloperEvent {
  return {
    id,
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

const eligibleResult = {
  eventId: "pull_request:42",
  eligible: true,
  xp: 30,
  classification: "merged_pull_request" as const,
  reason: "Merged implementation pull request",
  attributeAwards: [
    {
      attribute: "builder" as const,
      amount: 1,
      eventId: "pull_request:42",
      ruleId: "pr.merged",
    },
  ],
  scoringVersion: "scoring-v1" as const,
};

const rejectedResult = {
  eventId: "push:1",
  eligible: false,
  xp: 0,
  classification: null,
  reason: "No scoring rule handles this event.",
  attributeAwards: [],
  scoringVersion: "scoring-v1" as const,
  rejectionReason: "unsupported_event" as const,
};

/* -------------------------------------------------------------------------- */

describe("ledgerEntryFor Ã¢â‚¬â€ Ã‚Â§17 fields", () => {
  it("records every field TASKS 5.10 requires", () => {
    const entry = ledgerEntryFor({
      result: eligibleResult,
      event: event("pull_request:42"),
      awardedAt: AWARDED_AT,
    });

    // event, reason, XP, attribute impact, scoring version, source URL.
    expect(entry).toEqual({
      id: "xp:octocat:pull_request:42:scoring-v1",
      eventId: "pull_request:42",
      developerLogin: "octocat",
      xp: 30,
      classification: "merged_pull_request",
      reason: "Merged implementation pull request",
      ruleId: "pr.merged",
      attributeAwards: eligibleResult.attributeAwards,
      scoringVersion: "scoring-v1",
      sourceUrl: "https://github.com/octocat/octo-repo/pull/82",
      awardedAt: AWARDED_AT,
    });
  });

  it("uses the idempotency key as its identity (Ã‚Â§18)", () => {
    // Ã‚Â§18: "a stable event identity plus an idempotency key". The key IS the
    // record's id, so two entries colliding means the same event was awarded
    // twice under one version.
    const entry = ledgerEntryFor({
      result: eligibleResult,
      event: event("pull_request:42"),
      awardedAt: AWARDED_AT,
    });

    expect(entry.id).toBe("xp:octocat:pull_request:42:scoring-v1");
  });

  it("carries the source URL through verbatim", () => {
    // Ã‚Â§10 "retain the source issue URL" and Ã‚Â§17 "Source" both read this.
    const entry = ledgerEntryFor({
      result: eligibleResult,
      event: event("pull_request:42", { sourceUrl: "https://example.test/pr/1" }),
      awardedAt: AWARDED_AT,
    });

    expect(entry.sourceUrl).toBe("https://example.test/pr/1");
  });

  it("records a null source URL rather than inventing one", () => {
    const entry = ledgerEntryFor({
      result: eligibleResult,
      event: event("pull_request:42", { sourceUrl: null }),
      awardedAt: AWARDED_AT,
    });

    expect(entry.sourceUrl).toBeNull();
  });

  it("uses the timestamp it was given, so a replay can be faithful", () => {
    const entry = ledgerEntryFor({
      result: eligibleResult,
      event: event("pull_request:42"),
      awardedAt: "2024-01-01T00:00:00Z",
    });

    expect(entry.awardedAt).toBe("2024-01-01T00:00:00Z");
  });

  it("falls back to a stated ruleId when an award carried no attributes", () => {
    // An XP-only award is legitimate (Ã‚Â§15 keeps the axes separate).
    const entry = ledgerEntryFor({
      result: { ...eligibleResult, attributeAwards: [] },
      event: event("pull_request:42"),
      awardedAt: AWARDED_AT,
    });

    expect(entry.ruleId).toBe("none");
  });
});

describe("ledgerEntryFor Ã¢â‚¬â€ rejects what it cannot explain", () => {
  it("throws on an ineligible result", () => {
    expect(() =>
      ledgerEntryFor({
        result: rejectedResult,
        event: event("push:1"),
        awardedAt: AWARDED_AT,
      }),
    ).toThrow(/ineligible/);
  });

  it("throws when an eligible result carries no classification", () => {
    expect(() =>
      ledgerEntryFor({
        result: { ...eligibleResult, classification: null },
        event: event("pull_request:42"),
        awardedAt: AWARDED_AT,
      }),
    ).toThrow(/classification/);
  });

  it("names the rejection reason in the error, so a bug points at itself", () => {
    expect(() =>
      ledgerEntryFor({
        result: rejectedResult,
        event: event("push:1"),
        awardedAt: AWARDED_AT,
      }),
    ).toThrow(/unsupported_event/);
  });
});

describe("ledgerEntriesFor", () => {
  it("records only the eligible results", () => {
    const results = [
      eligibleResult,
      { ...rejectedResult, eventId: "push:1" },
    ];

    const entries = ledgerEntriesFor(
      results,
      [event("pull_request:42"), event("push:1", { kind: "push" })],
      AWARDED_AT,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].eventId).toBe("pull_request:42");
  });

  it("returns nothing for a run of rejections", () => {
    const entries = ledgerEntriesFor(
      [rejectedResult],
      [event("push:1", { kind: "push" })],
      AWARDED_AT,
    );

    expect(entries).toEqual([]);
  });

  it("hands every entry the same timestamp", () => {
    const results = [
      eligibleResult,
      { ...eligibleResult, eventId: "pull_request:43" },
    ];

    const entries = ledgerEntriesFor(
      results,
      [event("pull_request:42"), event("pull_request:43")],
      AWARDED_AT,
    );

    expect(new Set(entries.map((e) => e.awardedAt))).toEqual(
      new Set([AWARDED_AT]),
    );
  });

  it("throws when an eligible result cites an event that was not supplied", () => {
    // A ledger entry must cite the evidence it was awarded for.
    expect(() =>
      ledgerEntriesFor([eligibleResult], [], AWARDED_AT),
    ).toThrow(/No event found/);
  });

  it("gives distinct events distinct identities", () => {
    const results = [
      eligibleResult,
      { ...eligibleResult, eventId: "pull_request:43", xp: 0 },
    ];

    const entries = ledgerEntriesFor(
      results,
      [event("pull_request:42"), event("pull_request:43")],
      AWARDED_AT,
    );

    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });

  it("persists without transformation (TASKS 10.2)", () => {
    // The record is a table row as much as a type.
    const entry = ledgerEntryFor({
      result: eligibleResult,
      event: event("pull_request:42"),
      awardedAt: AWARDED_AT,
    });

    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
  });
});

describe("ledgerEntryFor — a composed award", () => {
  const composed = {
    ...eligibleResult,
    xp: 42,
    attributeAwards: [
      {
        attribute: "builder" as const,
        amount: 1,
        eventId: "pull_request:42",
        ruleId: "pr.merged",
      },
      {
        attribute: "debugger" as const,
        amount: 1,
        eventId: "pull_request:42",
        ruleId: "pr.regression_test",
      },
    ],
    breakdown: [
      {
        classification: "merged_pull_request" as const,
        ruleId: "pr.merged",
        xp: 30,
      },
      {
        classification: "verified_regression_test" as const,
        ruleId: "pr.regression_test",
        xp: 12,
      },
    ],
  };

  it("persists the breakdown, so +42 survives as two explainable lines", () => {
    // Without this the record would carry only a total, and a reader could not
    // tell a composed award from a miscalibrated one (SCORING.md §17).
    const entry = ledgerEntryFor({
      result: composed,
      event: event("pull_request:42"),
      awardedAt: AWARDED_AT,
    });

    expect(entry.breakdown).toEqual(composed.breakdown);
    expect(entry.breakdown?.reduce((total, line) => total + line.xp, 0)).toBe(
      entry.xp,
    );
  });

  it("omits the key entirely for a single-line award", () => {
    // Absent rather than an empty array, so "one line" and "no breakdown recorded"
    // are not the same claim.
    const entry = ledgerEntryFor({
      result: eligibleResult,
      event: event("pull_request:42"),
      awardedAt: AWARDED_AT,
    });

    expect(entry).not.toHaveProperty("breakdown");
  });

  it("still records one transaction, so §18's key is unchanged", () => {
    // Two §4 lines for one event must not become two rows: the key is scoped to
    // the event, and a second row would collide on the same primary key.
    const entry = ledgerEntryFor({
      result: composed,
      event: event("pull_request:42"),
      awardedAt: AWARDED_AT,
    });

    expect(entry.id).toBe("xp:octocat:pull_request:42:scoring-v1");
  });
});
