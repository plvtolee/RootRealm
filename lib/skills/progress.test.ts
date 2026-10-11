import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { SKILL_DEFINITIONS } from "./catalog";
import { indexSkills } from "./definition";
import { computeAllEvidence } from "./evidence";
import {
  eligibleNodes,
  evaluateAllProgress,
  evaluateProgress,
  isEligible,
  progressById,
  resolveRequirement,
  type AttributeTotals,
  type SkillProgress,
} from "./progress";

const INDEX = indexSkills(SKILL_DEFINITIONS);
const node = (id: string) => INDEX.get(id)!;

/* -------------------------------------------------------------------------- */
/* Event builders — the same shapes the evidence module consumes              */
/* -------------------------------------------------------------------------- */

function event(over: Partial<DeveloperEvent> = {}): DeveloperEvent {
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
  return event({
    kind: "pull_request",
    id: `pr:${over.action ?? "merged"}`,
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
  over: { state?: string | null; action?: string | null } = {},
): DeveloperEvent {
  return event({
    kind: "review",
    id: "review:1",
    evidence: {
      number: 42,
      state: over.state ?? "approved",
      action: over.action ?? "created",
      subject: "review",
    },
  });
}

function issue(
  over: { action?: string | null; authored?: boolean | null } = {},
): DeveloperEvent {
  return event({
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
  over: { action?: string | null; draft?: boolean | null } = {},
): DeveloperEvent {
  return event({
    kind: "release",
    id: "release:1",
    evidence: {
      tag: "v1.0.0",
      name: "One",
      action: over.action ?? "published",
      draft: over.draft ?? false,
      prerelease: false,
    },
  });
}

function documentation(over: { pagesCreated?: number } = {}): DeveloperEvent {
  return event({
    kind: "documentation",
    id: "wiki:1",
    evidence: {
      pagesChanged: 1,
      pagesCreated: over.pagesCreated ?? 1,
      page: "README",
    },
  });
}

function push(
  over: { headSha?: string | null; beforeSha?: string | null } = {},
): DeveloperEvent {
  return event({
    kind: "push",
    id: "push:1",
    evidence: {
      branch: "main",
      headSha: over.headSha ?? "abc",
      beforeSha: over.beforeSha ?? "def",
    },
  });
}

/** Progress for one node, with defaults for the other inputs. */
function progressFor(
  id: string,
  events: readonly DeveloperEvent[],
  options: {
    attributeTotals?: AttributeTotals;
    learnedIds?: Iterable<string>;
  } = {},
): SkillProgress {
  const learned = new Set(options.learnedIds ?? []);
  const counts = computeAllEvidence(events);

  return evaluateProgress(node(id), {
    prerequisites: new Map(),
    counts,
    attributeTotals: options.attributeTotals ?? {},
    learnedIds: learned,
  });
}

/* -------------------------------------------------------------------------- */

describe("TASKS 6.4 — the three numbers", () => {
  it("reports current and required progress", () => {
    const progress = progressFor("builder-foundation", [pr(), pr()]);

    // builder-foundation requires 2 merged PRs.
    expect(progress.required).toBe(2);
    expect(progress.current).toBe(2);
  });

  it("reports partial progress, not a percentage", () => {
    const progress = progressFor("builder-foundation", [pr()]);

    expect(progress.current).toBe(1);
    expect(progress.required).toBe(2);
  });

  it("clamps current at required, so 5 PRs read as 2 of 2", () => {
    // A surplus is not 167% progress, and a bar drawn from it would overflow.
    const progress = progressFor("builder-foundation", [pr(), pr(), pr(), pr(), pr()]);

    expect(progress.current).toBe(2);
    expect(progress.required).toBe(2);
  });

  it("reports zero for the Origin, which has no requirement", () => {
    // 0 of 0, not the fiction of 1 of 1. The Origin is granted on a connected
    // account, so it has no evidence to accumulate.
    const progress = progressFor("origin", []);

    expect(progress.current).toBe(0);
    expect(progress.required).toBe(0);
    expect(progress.evidenceMet).toBe(true);
  });
});

describe("TASKS 6.4 — status is two gates, not one score", () => {
  it("locks a node whose prerequisite is missing", () => {
    // builder-roots needs the Origin; without it nothing else matters.
    const progress = progressFor("builder-roots", [pr(), pr()], {
      learnedIds: [],
    });

    expect(progress.status).toBe("locked");
  });

  it("does not let evidence substitute for a prerequisite", () => {
    // A developer with 50 merged PRs still cannot have builder-foundation
    // without builder-roots: §26 lists the two as separate inputs.
    const events = Array.from({ length: 50 }, () => pr());
    const progress = progressFor("builder-foundation", events, {
      learnedIds: [],
    });

    expect(progress.status).toBe("locked");
    expect(progress.current).toBe(2);
  });

  it("reports in-progress when prerequisites pass but evidence is short", () => {
    const progress = progressFor("builder-roots", [], {
      learnedIds: ["origin"],
    });

    expect(progress.status).toBe("in-progress");
  });

  it("reports eligible when both gates pass", () => {
    const progress = progressFor("builder-roots", [push()], {
      learnedIds: ["origin"],
    });

    expect(progress.status).toBe("eligible");
    expect(progress.evidenceMet).toBe(true);
  });

  it("reports learned for a node already in the learned set", () => {
    // `learned` outranks the other gates, so a node learned and then outgrown
    // still reports as owned rather than as eligible again.
    const progress = progressFor("builder-roots", [], {
      learnedIds: ["origin", "builder-roots"],
    });

    expect(progress.status).toBe("learned");
  });

  it("keeps locked > in-progress distinct from eligible, which is the point", () => {
    // If these collapsed, a permanently blocked node would read the same as one
    // short of its requirement, and the fix for each is different.
    const locked = progressFor("builder-roots", [], { learnedIds: [] });
    const inProgress = progressFor("builder-roots", [], {
      learnedIds: ["origin"],
    });
    const eligible = progressFor("builder-roots", [push()], {
      learnedIds: ["origin"],
    });

    expect(new Set([locked.status, inProgress.status, eligible.status]).size).toBe(3);
  });
});

describe("resolveRequirement — attribute_units", () => {
  const counts = computeAllEvidence([]);

  it("reads from the attribute totals, not from events", () => {
    // An attribute unit is the scoring axis, not an event. A node requiring 3
    // Builder units is satisfied by attribute progress, not by extra pushes.
    const builder = resolveRequirement(
      { kind: "attribute_units", attribute: "builder", count: 3 },
      counts,
      { builder: 4 },
    );

    expect(builder).toBe(4);
  });

  it("reads zero for an attribute with no progress", () => {
    expect(
      resolveRequirement(
        { kind: "attribute_units", attribute: "architect", count: 3 },
        counts,
        { builder: 4 },
      ),
    ).toBe(0);
  });

  it("satisfies an Architect node only from Architect units", () => {
    // Not from Builder units, which is why the totals are keyed per attribute
    // rather than being one global pool.
    const progress = progressFor("architect-roots", [], {
      attributeTotals: { builder: 100 },
    });

    expect(progress.current).toBe(0);
    expect(progress.status).toBe("locked");

    const withUnits = progressFor("architect-roots", [], {
      learnedIds: ["origin"],
      attributeTotals: { architect: 1 },
    });

    expect(withUnits.current).toBe(1);
    expect(withUnits.status).toBe("eligible");
  });

  it("agrees with the evidence module for every event-counted kind", () => {
    // resolveRequirement must not diverge from what 6.3 counts, or a node would
    // report progress the scoring system did not award.
    const events = [pr(), review(), issue(), release(), documentation(), push()];
    const computed = computeAllEvidence(events);

    for (const [kind, expected] of [
      ["merged_pull_requests", computed.merged_pull_requests],
      ["completed_reviews", computed.completed_reviews],
      ["linked_issue_closures", computed.linked_issue_closures_total],
      ["published_releases", computed.published_releases],
      ["qualifying_documentation", computed.qualifying_documentation],
      ["verified_regression_tests", computed.verified_regression_tests],
      ["landed_pushes", computed.landed_pushes],
    ] as const) {
      expect(resolveRequirement({ kind, count: 1 } as never, computed, {}), kind).toBe(
        expected,
      );
    }
  });
});

describe("evaluateAllProgress — the whole tree", () => {
  it("covers every node", () => {
    expect(evaluateAllProgress(SKILL_DEFINITIONS, [])).toHaveLength(
      SKILL_DEFINITIONS.length,
    );
  });

  it("opens each branch's roots node once the Origin is learned", () => {
    // Each branch requires its own evidence, so the events differ per branch
    // rather than one batch satisfying every root.
    const events = [
      push(), // builder-roots — landed_pushes 1
      issue(), // debugger-roots — linked_issue_closures 1
      review(), // collaborator-roots — completed_reviews 1
      release(), // maintainer-roots — published_releases 1
      documentation(), // scholar-roots — qualifying_documentation 1
    ];
    const progress = evaluateAllProgress(SKILL_DEFINITIONS, events, {
      learnedIds: ["origin"],
    });
    const byId = new Map(progress.map((entry) => [entry.skillId, entry]));

    for (const branch of [
      "builder",
      "debugger",
      "scholar",
      "collaborator",
      "maintainer",
    ]) {
      expect(byId.get(`${branch}-roots`)?.status, branch).toBe("eligible");
    }

    // Architect is the documented exception: §14 awards it nothing, so its
    // roots node stays at zero progress and reads as in-progress, not eligible.
    expect(byId.get("architect-roots")?.status).toBe("in-progress");
    expect(byId.get("architect-roots")?.current).toBe(0);
  });

  it("is deterministic", () => {
    const events = [pr(), review(), push()];

    expect(evaluateAllProgress(SKILL_DEFINITIONS, events)).toEqual(
      evaluateAllProgress(SKILL_DEFINITIONS, events),
    );
  });

  it("progressById indexes by skill id", () => {
    const index = progressById(SKILL_DEFINITIONS, [pr()], {
      learnedIds: ["origin", "builder-roots"],
    });

    expect(index.get("builder-foundation")?.current).toBe(1);
    expect(index.get("nope")).toBeUndefined();
  });

  it("eligibleNodes returns only nodes whose gates all pass", () => {
    const all = evaluateAllProgress(SKILL_DEFINITIONS, [push(), pr()], {
      learnedIds: ["origin"],
    });
    const eligible = eligibleNodes(all);

    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.every((entry) => entry.status === "eligible")).toBe(true);
    expect(eligible.map((entry) => entry.skillId)).toContain("builder-roots");
  });
});

describe("isEligible — one question, no claim of being unlocked", () => {
  it("is true when every gate passes", () => {
    expect(
      isEligible(node("builder-roots"), INDEX, [push()], {
        learnedIds: ["origin"],
      }),
    ).toBe(true);
  });

  it("is false when a prerequisite is missing, however much evidence exists", () => {
    const events = Array.from({ length: 50 }, () => push());

    expect(
      isEligible(node("builder-roots"), INDEX, events, { learnedIds: [] }),
    ).toBe(false);
  });

  it("is false when evidence is short", () => {
    expect(
      isEligible(node("builder-foundation"), INDEX, [pr()], {
        learnedIds: ["builder-roots"],
      }),
    ).toBe(false);
  });

  it("is false for a node already learned, because it is not *to be* learned", () => {
    // eligibility asks "may this be learned now", and a learned node already was.
    expect(
      isEligible(node("builder-roots"), INDEX, [push()], {
        learnedIds: ["origin", "builder-roots"],
      }),
    ).toBe(false);
  });

  it("is false for an unknown node rather than throwing", () => {
    expect(isEligible(node("nope"), INDEX, [])).toBe(false);
  });
});

describe("requirementText", () => {
  it("describes what the node needs, in renderable words", () => {
    const progress = progressFor("builder-foundation", [pr()]);

    expect(progress.requirementText).toBe("2 merged pull requests");
  });

  it("names the Origin's real requirement", () => {
    expect(progressFor("origin", []).requirementText).toBe(
      "A connected GitHub account",
    );
  });

  it("never renders blank or undefined", () => {
    for (const entry of evaluateAllProgress(SKILL_DEFINITIONS, [])) {
      expect(entry.requirementText.length, entry.skillId).toBeGreaterThan(0);
      expect(entry.requirementText, entry.skillId).not.toContain("undefined");
    }
  });
});

describe("SCORING.md §26 — not unlocked by global XP alone", () => {
  it("cannot be satisfied by XP: attribute units are a separate axis", () => {
    // A developer with every event type in quantity still cannot unlock an
    // attribute-unit node, because XP and units are different measurements.
    const events = Array.from({ length: 20 }, () => pr());
    const progress = progressFor("architect-roots", events, {
      learnedIds: ["origin"],
    });

    expect(progress.status).toBe("in-progress");
    expect(progress.current).toBe(0);
  });

  it("satisfies the node once the units arrive, however they were earned", () => {
    const progress = progressFor("architect-roots", [], {
      learnedIds: ["origin"],
      attributeTotals: { architect: 1 },
    });

    expect(progress.status).toBe("eligible");
  });
});

describe("determinism and purity", () => {
  it("does not mutate its input events", () => {
    const events = [pr(), issue(), push()];
    const before = JSON.stringify(events);

    evaluateAllProgress(SKILL_DEFINITIONS, events);

    expect(JSON.stringify(events)).toBe(before);
  });

  it("handles an empty history without throwing", () => {
    const progress = evaluateAllProgress(SKILL_DEFINITIONS, []);

    expect(progress.length).toBe(SKILL_DEFINITIONS.length);
    // The Origin has no requirement, so with nothing learned it is eligible
    // (ready to be granted on a connected account) rather than locked. Every
    // other node needs at least a prerequisite, so it is locked.
    expect(
      progress.filter((entry) => entry.status !== "locked").map((e) => e.skillId),
    ).toEqual(["origin"]);
  });

  it("reports integer current and required throughout", () => {
    // §16 keeps attribute units integral, and a fractional requirement would
    // make "how much is left" unanswerable.
    for (const entry of evaluateAllProgress(SKILL_DEFINITIONS, [pr(), push()])) {
      expect(Number.isInteger(entry.current), entry.skillId).toBe(true);
      expect(Number.isInteger(entry.required), entry.skillId).toBe(true);
      expect(entry.current).toBeGreaterThanOrEqual(0);
      expect(entry.required).toBeGreaterThanOrEqual(entry.current);
    }
  });
});
