import { describe, expect, it } from "vitest";

import { calculateAttributes, scoreEvent, scoreEvents, summarize } from "./engine";
import { filterNewAwards } from "./idempotency";
import { scoringFixtures } from "./fixtures";
import { calculateLevel } from "./levels";
import { SKILL_DEFINITIONS } from "../skills/catalog";
import { evaluateAll } from "../skills/prerequisites";
import {
  SCORING_V1,
  type RejectionReason,
  type ScoreResult,
} from "./types";

/**
 * `SCORING.md` §37's worked cases, asserted.
 *
 * These are the spec's own arithmetic. A rule can satisfy every §8–§12 requirement
 * and still disagree with §37 by a point, and nothing else in the suite would
 * notice — the unit tests assert each rule against itself.
 *
 * Kept separate from the rule tests on purpose: those say "this rule does what it
 * says", these say "what it says is what the document says".
 */
function event(over: {
  kind: ScoreResult extends never ? never : string;
  evidence: Record<string, unknown>;
  id: string;
}): Parameters<typeof scoreEvent>[0] {
  return {
    id: over.id,
    kind: over.kind,
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
    evidence: over.evidence,
  } as unknown as Parameters<typeof scoreEvent>[0];
}

const mergedPr = event({
  id: "pull_request:1",
  kind: "pull_request",
  evidence: {
    number: 42,
    action: "merged",
    merged: true,
    headRef: "feature",
    baseRef: "main",
    testFiles: null,
  },
});

/** §37 Case B and Case C, reused where a comparison needs more than one award. */
const reviewCase = () =>
  event({
    id: "review:1",
    kind: "review",
    evidence: {
      number: 42,
      state: "approved",
      action: "created",
      subject: "review",
    },
  });

const releaseCase = () =>
  event({
    id: "release:1",
    kind: "release",
    evidence: {
      tag: "v1.0.0",
      name: "One",
      action: "published",
      draft: false,
      prerelease: false,
    },
  });

describe("§37 Case A — merged PR", () => {
  it("awards +30 XP and a Builder contribution", () => {
    const result = scoreEvent(mergedPr, SCORING_V1);

    expect(result.xp).toBe(30);
    expect(result.attributeAwards.map((a) => a.attribute)).toEqual(["builder"]);
  });
});

describe("§37 Case B — completed review", () => {
  it("awards +15 XP and a Collaborator contribution", () => {
    const result = scoreEvent(
      event({
        id: "review:1",
        kind: "review",
        evidence: {
          number: 42,
          state: "approved",
          action: "created",
          subject: "review",
        },
      }),
      SCORING_V1,
    );

    expect(result.xp).toBe(15);
    expect(result.attributeAwards.map((a) => a.attribute)).toEqual([
      "collaborator",
    ]);
  });
});

describe("§37 Case C — qualifying release", () => {
  it("awards +25 XP and a Maintainer contribution", () => {
    const result = scoreEvent(
      event({
        id: "release:1",
        kind: "release",
        evidence: {
          tag: "v1.0.0",
          name: "One",
          action: "published",
          draft: false,
          prerelease: false,
        },
      }),
      SCORING_V1,
    );

    expect(result.xp).toBe(25);
    expect(result.attributeAwards.map((a) => a.attribute)).toEqual([
      "maintainer",
    ]);
  });
});

describe("§37 Case D — duplicate PR", () => {
  it("awards on first processing and not on the second", () => {
    const run = [
      { eventId: "pull_request:1", eligible: true, scoringVersion: "scoring-v1" as const },
    ];

    const first = filterNewAwards(run, "octocat", "scoring-v1");
    const second = filterNewAwards(run, "octocat", "scoring-v1", {
      alreadyAwarded: first.map((decision) => decision.key),
    });

    expect(first[0].duplicate).toBe(false);
    expect(second[0].duplicate).toBe(true);
  });

  it("reports the second pass as `already_rewarded`", () => {
    /*
     * §37 Case D states the reason explicitly, and §35 lists `already_rewarded`
     * among the machine-readable reasons.
     *
     * This was the gap the conformance audit found: `filterNewAwards` returned
     * `{ duplicate: boolean }`, a yes/no answer, so the vocabulary was declared in
     * `RejectionReason` and asserted to exist by `types.test.ts` — but nothing
     * produced it, and a UI following §35 had no way to render §37's reason for a
     * repeat award.
     */
    const run = [
      { eventId: "pull_request:1", eligible: true, scoringVersion: "scoring-v1" as const },
    ];
    const first = filterNewAwards(run, "octocat", "scoring-v1");
    const decision = filterNewAwards(run, "octocat", "scoring-v1", {
      alreadyAwarded: first.map((entry) => entry.key),
    })[0];

    expect(decision.duplicate).toBe(true);
    expect(decision.rejectionReason).toBe("already_rewarded");
  });

  it("reports no reason for a first processing", () => {
    const run = [
      { eventId: "pull_request:1", eligible: true, scoringVersion: "scoring-v1" as const },
    ];

    expect(filterNewAwards(run, "octocat", "scoring-v1")[0].rejectionReason).toBeNull();
  });

  it("does not claim already_rewarded for an event that was never awarded", () => {
    /*
     * A rejected result awarded nothing, so there is no previous award to repeat.
     * Reporting `already_rewarded` here would assert an award that never
     * happened — the same conflation the `duplicate` flag already avoids.
     */
    const run = [
      { eventId: "push:1", eligible: false, scoringVersion: "scoring-v1" as const },
    ];
    const first = filterNewAwards(run, "octocat", "scoring-v1");
    const second = filterNewAwards(run, "octocat", "scoring-v1", {
      alreadyAwarded: first.map((entry) => entry.key),
    });

    expect(second[0].rejectionReason).toBeNull();
  });
});

describe("§37 Case E — trivial commit burst", () => {
  it("never scales an award with a commit count it cannot see", () => {
    /*
     * §7 and §37 both warn against treating every commit as a valuable
     * contribution. Since no ingested event carries a commit list, the structural
     * guarantee is stronger than §37 asks for: the award is flat per push, so it
     * cannot grow with commits inside that push.
     *
     * Asserted as flatness rather than as a total, because §7's per-commit value
     * (+3) happens to equal the per-push value (+3) — so a burst total cannot
     * distinguish a correct flat award from a per-commit one that guessed the
     * count right by accident. Flatness is the property that survives.
     */
    const burst = Array.from({ length: 50 }, (_unused, index) =>
      event({
        id: `push:${index}`,
        kind: "push",
        evidence: { branch: "main", headSha: `abc${index}`, beforeSha: `def${index}` },
      }),
    );

    const awards = burst.map((input) => scoreEvent(input, SCORING_V1).xp);

    // Every push is worth the same, whatever it contained.
    expect(new Set(awards).size).toBe(1);
    expect(awards[0]).toBe(SCORING_V1.xp.qualifying_push);

    // And the total is bounded by push count, not by any commit count.
    const total = awards.reduce((sum, xp) => sum + xp, 0);
    expect(total).toBe(50 * SCORING_V1.xp.qualifying_push);
  });
});

describe("§35 — every rejection reason the document names is declared", () => {
  it.each([
    "duplicate_event",
    "invalid_event",
    "insufficient_evidence",
    "not_attributable",
    "not_qualifying",
    "already_rewarded",
    "outside_scoring_scope",
    "anti_farming_rule",
    "unsupported_event",
  ])("declares %s", (reason) => {
    // §35 lists these as machine-readable so a UI can translate them. Declared
    // is not the same as produced — see Case D — but a missing member would mean
    // a UI could not name a case it must render.
    const declared: RejectionReason[] = [
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

    expect(declared).toContain(reason);
  });
});

describe("§36 — the fixtures it names all exist", () => {
  it.each([
    "active",
    "inactive",
    "new",
    "large",
    "empty",
    "duplicate_activity",
    "mixed_activity",
  ])("has the %s fixture", (profile) => {
    // `empty` was missing until this audit. `inactive` does not substitute: a
    // quiet account and an account that never had public activity are different
    // first-run cases.
    expect(scoringFixtures.map((fixture) => fixture.profile)).toContain(
      profile as (typeof scoringFixtures)[number]["profile"],
    );
  });
});

describe("§36 — skill prerequisites", () => {
  it("are evaluated, not merely declared", () => {
    // §36 lists prerequisites among the things the scoring engine must have unit
    // tests for. This records that TASKS 6.2 closed that item: the catalog alone
    // would not satisfy it.
    expect(SKILL_DEFINITIONS.length).toBeGreaterThan(0);
    expect(
      evaluateAll(SKILL_DEFINITIONS, ["origin"]).get("builder-roots")?.satisfied,
    ).toBe(true);
    expect(evaluateAll(SKILL_DEFINITIONS, []).get("builder-roots")?.satisfied).toBe(
      false,
    );
  });
});

describe("§33 — every named interface exists", () => {
  it("scoreEvent, scoreEvents and calculateLevel are implemented", () => {
    expect(typeof scoreEvent).toBe("function");
    expect(typeof scoreEvents).toBe("function");
    expect(typeof calculateLevel).toBe("function");
  });

  it("calculateAttributes returns a flat, traceable award list", () => {
    const awards = calculateAttributes([mergedPr], SCORING_V1);

    expect(awards).toEqual([
      {
        attribute: "builder",
        amount: 1,
        eventId: "pull_request:1",
        ruleId: "pr.merged",
      },
    ]);
  });

  it("calculateAttributes answers a different question from summarize", () => {
    /*
     * §33 names calculateAttributes returning `AttributeAward[]` — a flat list
     * where each award keeps `eventId` and `ruleId`. summarize answers "how many
     * Builder units"; this answers "which, and for what". A caller tracing where a
     * total came from cannot get there from a tally, so collapsing the two would
     * force a round-trip through persistence for a scoring question.
     */
    const events = [mergedPr, reviewCase(), releaseCase()];
    const awards = calculateAttributes(events, SCORING_V1);
    const summary = summarize(scoreEvents(events, SCORING_V1));

    // Same units, different shape: one keeps provenance, one does not.
    const total = awards.reduce((sum, award) => sum + award.amount, 0);
    const tallied = Object.values(summary.attributeTotals).reduce((a, b) => a + b, 0);

    expect(total).toBe(tallied);
    expect(awards.every((award) => award.eventId.length > 0)).toBe(true);
    expect(awards.every((award) => award.ruleId.length > 0)).toBe(true);
  });

  it("carries no awards for a rejected event", () => {
    const opened = event({
      id: "pull_request:2",
      kind: "pull_request",
      evidence: {
        number: 43,
        action: "opened",
        merged: false,
        headRef: "f",
        baseRef: "main",
        testFiles: null,
      },
    });

    expect(calculateAttributes([opened], SCORING_V1)).toEqual([]);
  });

  it("is empty for an empty run rather than throwing", () => {
    expect(calculateAttributes([], SCORING_V1)).toEqual([]);
  });

  it("is deterministic", () => {
    const events = [mergedPr, reviewCase()];

    expect(calculateAttributes(events, SCORING_V1)).toEqual(
      calculateAttributes(events, SCORING_V1),
    );
  });
});