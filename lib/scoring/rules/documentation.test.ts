import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../../developer-event";
import { documentationRule, RULE_ID } from "./documentation";
import { SCORING_V1 } from "../types";

function wiki(over: {
  pagesChanged?: number;
  pagesCreated?: number;
  page?: string | null;
  confidence?: "verified" | "inferred";
  id?: string;
} = {}): DeveloperEvent {
  return {
    id: over.id ?? "documentation:16855873910",
    kind: "documentation",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-08T10:00:00Z",
    visibility: "public",
    confidence: over.confidence ?? "verified",
    sourceUrl: null,
    relevance: "scored",
    limitations: [],
    evidence: {
      pagesChanged: over.pagesChanged === undefined ? 1 : over.pagesChanged,
      pagesCreated: over.pagesCreated === undefined ? 1 : over.pagesCreated,
      page: over.page === undefined ? "Home" : over.page,
    },
  } as DeveloperEvent;
}

const score = (event: DeveloperEvent) =>
  documentationRule.evaluate(event, SCORING_V1);

/* -------------------------------------------------------------------------- */

describe("documentationRule — applicability", () => {
  it("declines an event that is not documentation", () => {
    const notDocs = { ...wiki(), kind: "release" } as DeveloperEvent;

    expect(score(notDocs)).toBeNull();
  });

  it("identifies itself with a stable rule id", () => {
    expect(documentationRule.ruleId).toBe("docs.created");
    expect(score(wiki())?.attributeAwards[0].ruleId).toBe(RULE_ID);
  });
});

describe("documentationRule — created pages (§12)", () => {
  it("awards the §4 value", () => {
    expect(score(wiki())).toMatchObject({
      eligible: true,
      xp: 10,
      classification: "qualifying_documentation",
    });
  });

  it("awards Scholar, its primary attribute (§12, §14)", () => {
    const awards = score(wiki())?.attributeAwards ?? [];

    expect(awards).toHaveLength(1);
    expect(awards[0].attribute).toBe("scholar");
  });

  it("awards nothing §12 did not name", () => {
    const attributes = (score(wiki())?.attributeAwards ?? []).map((a) => a.attribute);

    expect(attributes).toEqual(["scholar"]);
  });

  it("awards once for an event that created several pages", () => {
    // One act of work. §12 gives a flat value with no per-page multiplier, so a
    // bulk rename must not count as several documents.
    const result = score(wiki({ pagesChanged: 4, pagesCreated: 4 }));

    expect(result?.xp).toBe(10);
    expect(result?.attributeAwards).toHaveLength(1);
  });

  it("says how many pages when there were several", () => {
    expect(score(wiki({ pagesChanged: 3, pagesCreated: 3 }))?.reason).toBe(
      "Created 3 wiki pages",
    );
  });

  it("names the single page in the singular", () => {
    expect(score(wiki())?.reason).toBe("Created a wiki page");
  });
});

describe("documentationRule — edits alone do not qualify (§12)", () => {
  it("declines an event that only edited pages", () => {
    // §12: "meaningful qualifying work rather than simply any textual change".
    // With no diff or size in the payload, a typo fix and a rewrite are
    // indistinguishable, so neither can be confirmed as meaningful.
    const result = score(wiki({ pagesChanged: 1, pagesCreated: 0 }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("not_qualifying");
  });

  it("qualifies when a mixed event created at least one page", () => {
    const result = score(wiki({ pagesChanged: 3, pagesCreated: 1 }));

    expect(result?.eligible).toBe(true);
  });

  it("explains why an edit-only change was declined", () => {
    expect(score(wiki({ pagesChanged: 2, pagesCreated: 0 }))?.reason).toContain(
      "edited existing pages",
    );
  });
});

describe("documentationRule — missing evidence", () => {
  it("declines an event that reported no pages", () => {
    // A payload that said nothing is missing evidence, not unworthy work — a
    // different §35 reason from declining a known non-qualifying edit.
    const result = score(wiki({ pagesChanged: 0, pagesCreated: 0 }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("insufficient_evidence");
  });

  it("separates a silent payload from an edit-only one", () => {
    const silent = score(wiki({ pagesChanged: 0, pagesCreated: 0 }));
    const editsOnly = score(wiki({ pagesChanged: 1, pagesCreated: 0 }));

    expect(silent?.rejectionReason).not.toBe(editsOnly?.rejectionReason);
  });
});

describe("documentationRule — attribution", () => {
  it("declines an unattributable wiki change", () => {
    const result = score(wiki({ confidence: "inferred" }));

    expect(result?.rejectionReason).toBe("not_attributable");
    expect(result?.xp).toBe(0);
  });

  it("checks attribution before the page counts", () => {
    const result = score(
      wiki({ confidence: "inferred", pagesChanged: 0, pagesCreated: 0 }),
    );

    expect(result?.rejectionReason).toBe("not_attributable");
  });
});

describe("documentationRule — purity", () => {
  it("is deterministic", () => {
    const event = wiki();

    expect(score(event)).toEqual(score(event));
  });

  it("does not mutate the event", () => {
    const event = wiki();
    const before = JSON.stringify(event);

    score(event);

    expect(JSON.stringify(event)).toBe(before);
  });
});
