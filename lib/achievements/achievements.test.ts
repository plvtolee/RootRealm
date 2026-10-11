import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { ACHIEVEMENT_DEFINITIONS, indexAchievements } from "./definition";
import { evaluateAchievement, evaluateAllAchievements } from "./eligibility";
import { isAchievementEarned, unlockAchievement } from "./unlock";

function merged(id: string): DeveloperEvent {
  return {
    id,
    kind: "pull_request",
    evidence: { merged: true, action: "merged", testFiles: null },
  } as unknown as DeveloperEvent;
}

function released(id: string): DeveloperEvent {
  return {
    id,
    kind: "release",
    evidence: { action: "published", draft: false },
  } as unknown as DeveloperEvent;
}

function reviewed(id: string): DeveloperEvent {
  return {
    id,
    kind: "review",
    evidence: { state: "approved", action: "created", subject: "review" },
  } as unknown as DeveloperEvent;
}

function documented(id: string): DeveloperEvent {
  return {
    id,
    kind: "documentation",
    evidence: { pagesCreated: 1, pagesChanged: 1, page: "Home" },
  } as unknown as DeveloperEvent;
}

const byId = indexAchievements(ACHIEVEMENT_DEFINITIONS);

function definition(id: string) {
  const found = byId.get(id);
  if (!found) throw new Error(`missing achievement ${id}`);
  return found;
}

describe("achievement catalog (7.1)", () => {
  it("has unique ids", () => {
    expect(byId.size).toBe(ACHIEVEMENT_DEFINITIONS.length);
  });

  it("covers the spec examples", () => {
    for (const id of ["first-merge", "first-release", "reviewer", "documentation-milestone"]) {
      expect(byId.has(id)).toBe(true);
    }
  });

  it("uses only the contract's rarity values", () => {
    const allowed = new Set(["common", "rare", "epic", "legendary"]);
    for (const achievement of ACHIEVEMENT_DEFINITIONS) {
      expect(allowed.has(achievement.rarity)).toBe(true);
    }
  });

  it("requires a positive count for every criterion", () => {
    for (const achievement of ACHIEVEMENT_DEFINITIONS) {
      expect(achievement.criterion.count).toBeGreaterThan(0);
    }
  });
});

describe("achievement eligibility (7.2)", () => {
  it("is unmet with no evidence", () => {
    const progress = evaluateAchievement(definition("first-merge"), []);
    expect(progress).toEqual({ achievementId: "first-merge", current: 0, required: 1, met: false });
  });

  it("is met at the threshold", () => {
    const progress = evaluateAchievement(definition("first-merge"), [merged("a")]);
    expect(progress.met).toBe(true);
    expect(progress.current).toBe(1);
  });

  it("clamps progress to the requirement but keeps met correct", () => {
    const events = Array.from({ length: 12 }, (_, i) => merged(`m${i}`));
    const progress = evaluateAchievement(definition("contribution-10"), events);
    expect(progress.current).toBe(10);
    expect(progress.required).toBe(10);
    expect(progress.met).toBe(true);
  });

  it("is deterministic for the same events", () => {
    const events = [merged("a"), merged("b")];
    expect(evaluateAchievement(definition("contribution-10"), events)).toEqual(
      evaluateAchievement(definition("contribution-10"), events),
    );
  });

  it("counts the same evidence the skill engine counts", () => {
    const events = [merged("a"), reviewed("r"), released("x"), documented("d")];
    const all = evaluateAllAchievements(ACHIEVEMENT_DEFINITIONS, events);
    expect(all.find((p) => p.achievementId === "reviewer")?.met).toBe(true);
    expect(all.find((p) => p.achievementId === "first-release")?.met).toBe(true);
    expect(all.find((p) => p.achievementId === "documentation-milestone")?.met).toBe(true);
  });
});

describe("achievement unlocks (7.3)", () => {
  const input = (events: DeveloperEvent[], id: string) => ({
    progress: evaluateAchievement(definition(id), events),
    developerLogin: "octocat",
    scoringVersionId: "scoring-v1",
    unlockedAt: "2026-10-12T00:00:00.000Z",
  });

  it("records an earned achievement with its evidence references", () => {
    const events = [merged("a"), merged("b")];
    const result = unlockAchievement(input(events, "first-merge"), new Set(), definition("first-merge"), events);

    expect(result.duplicate).toBe(false);
    expect(result.unlock.achievementId).toBe("first-merge");
    expect(result.unlock.evidenceEventIds).toEqual(["a"]);
    expect(result.earnedIds).toEqual(["first-merge"]);
  });

  it("reports a duplicate without writing a second record", () => {
    const events = [merged("a")];
    const result = unlockAchievement(
      input(events, "first-merge"),
      new Set(["first-merge"]),
      definition("first-merge"),
      events,
    );

    expect(result.duplicate).toBe(true);
    expect(result.earnedIds).toEqual(["first-merge"]);
  });

  it("refuses an achievement the evidence does not meet", () => {
    expect(() =>
      unlockAchievement(input([], "first-merge"), new Set(), definition("first-merge"), []),
    ).toThrow(/not met/);
  });

  it("refuses progress that describes a different achievement", () => {
    const events = [merged("a")];
    expect(() =>
      unlockAchievement(
        input(events, "first-merge"),
        new Set(),
        definition("first-release"),
        events,
      ),
    ).toThrow(/cannot award/);
  });

  it("answers earned-ness from the store", () => {
    expect(isAchievementEarned("first-merge", new Set(["first-merge"]))).toBe(true);
    expect(isAchievementEarned("first-merge", new Set())).toBe(false);
  });
});
