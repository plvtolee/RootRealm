import { describe, expect, it } from "vitest";

import {
  ALL_CLASSIFICATIONS,
  ATTRIBUTE_MAPPING,
  AWARDED_ATTRIBUTES,
  UNAWARDED_ATTRIBUTES,
  attributeIsAwarded,
  attributeUnitsFor,
} from "./attributes";
import {
  ATTRIBUTES,
  SCORING_V1,
  type ScoringClassification,
} from "./types";

/* -------------------------------------------------------------------------- */

describe("ATTRIBUTE_MAPPING — covers every classification (§14)", () => {
  it("decides a mapping for every classification", () => {
    // A Record keyed by ScoringClassification makes an undecided classification
    // a compile error; this asserts the keys really are exhaustive.
    expect(ALL_CLASSIFICATIONS.sort()).toEqual(
      [
        "qualifying_commit",
        "qualifying_push",
        "merged_pull_request",
        "completed_review",
        "linked_issue_closure",
        "release",
        "qualifying_documentation",
        "verified_regression_test",
      ].sort(),
    );
  });

  it("maps every kind in document order", () => {
    expect(ATTRIBUTE_MAPPING.merged_pull_request({})).toEqual([
      { attribute: "builder", amount: 1 },
    ]);
    expect(ATTRIBUTE_MAPPING.completed_review({})).toEqual([
      { attribute: "collaborator", amount: 1 },
    ]);
    expect(ATTRIBUTE_MAPPING.release({})).toEqual([
      { attribute: "maintainer", amount: 1 },
    ]);
    expect(ATTRIBUTE_MAPPING.qualifying_documentation({})).toEqual([
      { attribute: "scholar", amount: 1 },
    ]);
  });

  it("uses §16's separate attribute units, at the §17 baseline", () => {
    for (const classification of ALL_CLASSIFICATIONS) {
      for (const authored of [true, false]) {
        for (const mapping of ATTRIBUTE_MAPPING[classification]({
          issueAuthored: authored,
        })) {
          // §16: attribute units are not XP. §17 illustrates "+1 unit".
          expect(mapping.amount).toBe(1);
        }
      }
    }
  });
});

describe("ATTRIBUTE_MAPPING — issue closure splits on authorship (§14)", () => {
  it("maps a self-fix to Debugger", () => {
    // §14 Debugger: "linked bug fixes".
    expect(
      ATTRIBUTE_MAPPING.linked_issue_closure({ issueAuthored: true }),
    ).toEqual([{ attribute: "debugger", amount: 1 }]);
  });

  it("maps triage of someone else's report to Maintainer", () => {
    // §14 Maintainer: "issue triage".
    expect(
      ATTRIBUTE_MAPPING.linked_issue_closure({ issueAuthored: false }),
    ).toEqual([{ attribute: "maintainer", amount: 1 }]);
  });

  it("defaults to Maintainer when authorship was not supplied", () => {
    // An unspecified context is treated as not-a-self-fix, which is the
    // conservative reading of §10's "do not award simply because the developer
    // closed an arbitrary issue".
    expect(ATTRIBUTE_MAPPING.linked_issue_closure({})).toEqual([
      { attribute: "maintainer", amount: 1 },
    ]);
  });

  it("never awards both attributes for one closure", () => {
    // §17's ledger example shows one attribute per primary contribution.
    expect(ATTRIBUTE_MAPPING.linked_issue_closure({ issueAuthored: true })).toHaveLength(1);
    expect(ATTRIBUTE_MAPPING.linked_issue_closure({ issueAuthored: false })).toHaveLength(1);
  });
});

describe("Architect is awarded nothing (§14)", () => {
  it("maps no classification to Architect", () => {
    // §14's primary evidence is "verified refactoring, modularization, system
    // design work" — all claims about WHAT changed. No ingested event exposes
    // file paths, diffs or commit lists, so none can distinguish architectural
    // work from any other work.
    for (const classification of ALL_CLASSIFICATIONS) {
      for (const authored of [true, false]) {
        const mapped = ATTRIBUTE_MAPPING[classification]({
          issueAuthored: authored,
        });

        expect(mapped.map((m) => m.attribute)).not.toContain("architect");
      }
    }
  });

  it("reports Architect among the unawarded attributes", () => {
    // The gap should be visible to anyone asking "what can a developer earn?"
    expect(UNAWARDED_ATTRIBUTES).toEqual(["architect"]);
  });

  it("is not awarded, and says so directly", () => {
    expect(attributeIsAwarded("architect")).toBe(false);
    expect(attributeIsAwarded("builder")).toBe(true);
    expect(attributeIsAwarded("debugger")).toBe(true);
    expect(attributeIsAwarded("scholar")).toBe(true);
    expect(attributeIsAwarded("collaborator")).toBe(true);
    expect(attributeIsAwarded("maintainer")).toBe(true);
  });

  it("documents why §14's conservative note applies", () => {
    // §14: "Architect scoring should be conservative because the underlying
    // evidence is harder to infer reliably from public GitHub activity." This
    // assertion is the conservatism — it forces a future implementer to confront
    // it rather than quietly filling the row in.
    expect(ATTRIBUTES).toContain("architect");
    expect(ALL_CLASSIFICATIONS).toHaveLength(8);
  });
});

describe("the two unawardable classifications map to nothing", () => {
  it.each(["qualifying_commit", "verified_regression_test"] as const)(
    "%s awards no attribute today",
    (classification) => {
      // No rule awards either, so neither produces an attribute award.
      expect(ATTRIBUTE_MAPPING[classification]({})).toEqual([]);
    },
  );

  it("distinguishes an unvalued rule from an unqualifiable one", () => {
    // A commit has no XP value AND no evidence. A regression test HAS a value —
    // §4 gives it +12 — but no ingested event can identify one, so the value is
    // currently unreachable. Conflating the two would suggest the value itself
    // is missing, when only the evidence is.
    expect(SCORING_V1.xp.qualifying_commit).toBeNull();
    expect(SCORING_V1.xp.verified_regression_test).toBe(12);
  });

  it("records them as un-awarded rather than omitted", () => {
    // An absent key would be invisible; an empty mapping is a decision.
    expect(ALL_CLASSIFICATIONS).toContain("qualifying_commit");
    expect(ALL_CLASSIFICATIONS).toContain("verified_regression_test");
  });

  it("gives Builder the push, which is §14's implementation work", () => {
    // §14 Builder: "qualifying implementation work". `qualifying_push` is the
    // evidence-backed stand-in for the commit-level claim, so the push must land
    // somewhere — otherwise adding it would have widened the Architect gap rather
    // than closed anything.
    expect(ATTRIBUTE_MAPPING.qualifying_push({})).toEqual([
      { attribute: "builder", amount: 1 },
    ]);
  });
});

describe("attributeUnitsFor", () => {
  it("resolves a mapping for a classification", () => {
    expect(attributeUnitsFor("merged_pull_request")).toEqual([
      { attribute: "builder", amount: 1 },
    ]);
  });

  it("threads the context through to a conditional mapping", () => {
    expect(attributeUnitsFor("linked_issue_closure", { issueAuthored: true })).toEqual([
      { attribute: "debugger", amount: 1 },
    ]);
    expect(attributeUnitsFor("linked_issue_closure", { issueAuthored: false })).toEqual([
      { attribute: "maintainer", amount: 1 },
    ]);
  });

  it("defaults the context to empty rather than requiring one", () => {
    const direct = attributeUnitsFor("merged_pull_request");
    const withContext = attributeUnitsFor("merged_pull_request", {});

    expect(direct).toEqual(withContext);
  });

  it("returns a fresh array each call, so callers cannot share state", () => {
    // The mappings are frozen constants; a shared array would let one caller's
    // mutation affect another.
    const first = attributeUnitsFor("merged_pull_request");
    const second = attributeUnitsFor("merged_pull_request");

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

describe("derived attribute sets", () => {
  it("awards the five attributes with evidence", () => {
    expect([...AWARDED_ATTRIBUTES].sort()).toEqual(
      ["builder", "collaborator", "debugger", "maintainer", "scholar"].sort(),
    );
  });

  it("derives the awarded set rather than hand-listing it", () => {
    // A new row must register itself here automatically.
    const derived = new Set<ScoringClassification>(
      ALL_CLASSIFICATIONS.flatMap((classification) =>
        ATTRIBUTE_MAPPING[classification]({}).length > 0 ? [classification] : [],
      ),
    );

    expect(derived.size).toBeGreaterThan(0);
  });
});
