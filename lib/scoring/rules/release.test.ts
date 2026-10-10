import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../../developer-event";
import { releaseRule, RULE_ID } from "./release";
import { SCORING_V1 } from "../types";

function release(over: {
  action?: string | null;
  tag?: string | null;
  draft?: boolean | null;
  prerelease?: boolean | null;
  confidence?: "verified" | "inferred";
  id?: string;
} = {}): DeveloperEvent {
  return {
    id: over.id ?? "release:16859073405",
    kind: "release",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-07T18:00:00Z",
    visibility: "public",
    confidence: over.confidence ?? "verified",
    sourceUrl: "https://github.com/octocat/octo-repo/releases/tag/v2.0.0",
    relevance: "scored",
    limitations: [],
    evidence: {
      tag: over.tag === undefined ? "v2.0.0" : over.tag,
      name: "Two",
      action: over.action === undefined ? "published" : over.action,
      draft: over.draft === undefined ? false : over.draft,
      prerelease: over.prerelease === undefined ? false : over.prerelease,
    },
  } as DeveloperEvent;
}

const score = (event: DeveloperEvent) => releaseRule.evaluate(event, SCORING_V1);

/* -------------------------------------------------------------------------- */

describe("releaseRule — applicability", () => {
  it("declines an event that is not a release", () => {
    const notRelease = { ...release(), kind: "issue" } as DeveloperEvent;

    expect(score(notRelease)).toBeNull();
  });

  it("identifies itself with a stable rule id", () => {
    expect(releaseRule.ruleId).toBe("release.published");
    expect(score(release())?.attributeAwards[0].ruleId).toBe(RULE_ID);
  });
});

describe("releaseRule — publishing (§11)", () => {
  it("awards the §4 value", () => {
    expect(score(release())).toMatchObject({
      eligible: true,
      xp: 25,
      classification: "release",
    });
  });

  it("awards Maintainer, its primary attribute (§11, §14)", () => {
    const awards = score(release())?.attributeAwards ?? [];

    expect(awards).toHaveLength(1);
    expect(awards[0].attribute).toBe("maintainer");
  });

  it("awards nothing §11 did not name", () => {
    const attributes = (score(release())?.attributeAwards ?? []).map((a) => a.attribute);

    expect(attributes).toEqual(["maintainer"]);
  });

  it("qualifies a promoted prerelease", () => {
    // `released` is a prerelease being promoted; both actions put work out.
    expect(score(release({ action: "released" }))?.eligible).toBe(true);
  });

  it("qualifies a prerelease publication, and says that is what it was", () => {
    // §11 does not exclude prereleases, and they are installable work.
    const result = score(release({ prerelease: true }));

    expect(result?.eligible).toBe(true);
    expect(result?.reason).toBe("Published a prerelease");
  });

  it("says plainly when it was a full release", () => {
    expect(score(release())?.reason).toBe("Published a release");
  });

  it("accepts an action in any casing", () => {
    expect(score(release({ action: "PUBLISHED" }))?.eligible).toBe(true);
  });
});

describe("releaseRule — actions that are not publications (§11)", () => {
  it.each(["created", "edited", "deleted", "unpublished"])(
    "declines a %s action",
    (action) => {
      // created is a draft, edited is a revision, deleted/unpublished describe a
      // withdrawal. Awarding any would credit shipping for not shipping.
      const result = score(release({ action }));

      expect(result?.eligible).toBe(false);
      expect(result?.rejectionReason).toBe("not_qualifying");
    },
  );

  it("declines a draft even when the action claims a publication", () => {
    // A contradictory payload should not be awarded on.
    const result = score(release({ draft: true }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("not_qualifying");
  });

  it("separates a missing action from a declined one", () => {
    const unknown = score(release({ action: null }));
    const edited = score(release({ action: "edited" }));

    expect(unknown?.rejectionReason).toBe("insufficient_evidence");
    expect(edited?.rejectionReason).toBe("not_qualifying");
  });
});

describe("releaseRule — attribution and source", () => {
  it("declines an unattributable release", () => {
    const result = score(release({ confidence: "inferred" }));

    expect(result?.rejectionReason).toBe("not_attributable");
    expect(result?.xp).toBe(0);
  });

  it("declines a release with no tag", () => {
    expect(score(release({ tag: null }))?.rejectionReason).toBe(
      "insufficient_evidence",
    );
  });

  it("checks attribution before the action", () => {
    const result = score(release({ confidence: "inferred", action: "edited" }));

    expect(result?.rejectionReason).toBe("not_attributable");
  });
});

describe("releaseRule — purity", () => {
  it("is deterministic", () => {
    const event = release();

    expect(score(event)).toEqual(score(event));
  });

  it("does not mutate the event", () => {
    const event = release();
    const before = JSON.stringify(event);

    score(event);

    expect(JSON.stringify(event)).toBe(before);
  });
});
