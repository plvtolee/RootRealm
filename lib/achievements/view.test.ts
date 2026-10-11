import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { ACHIEVEMENT_DEFINITIONS } from "./definition";
import { computeAchievementView } from "./view";

function merged(id: string): DeveloperEvent {
  return {
    id,
    kind: "pull_request",
    evidence: { merged: true, action: "merged", testFiles: null },
  } as unknown as DeveloperEvent;
}

describe("computeAchievementView (7.4)", () => {
  it("reports nothing earned with no events or records", () => {
    const state = computeAchievementView([], new Set());

    expect(state.earnedCount).toBe(0);
    expect(state.totalCount).toBe(ACHIEVEMENT_DEFINITIONS.length);
    expect(state.achievements.every((view) => !view.earned)).toBe(true);
  });

  it("marks an achievement earned only when it is recorded", () => {
    const events = [merged("a")];
    const unrecorded = computeAchievementView(events, new Set());
    const recorded = computeAchievementView(events, new Set(["first-merge"]));

    expect(unrecorded.achievements.find((v) => v.definition.id === "first-merge")?.earned).toBe(false);
    expect(recorded.achievements.find((v) => v.definition.id === "first-merge")?.earned).toBe(true);
  });

  it("keeps a recorded award even when the evidence no longer meets it", () => {
    const state = computeAchievementView([], new Set(["first-merge"]));
    const view = state.achievements.find((v) => v.definition.id === "first-merge");

    expect(view?.earned).toBe(true);
    expect(view?.progress.met).toBe(false);
  });

  it("reports progress from the evidence, clamped to the requirement", () => {
    const events = Array.from({ length: 12 }, (_, i) => merged(`m${i}`));
    const view = computeAchievementView(events, new Set()).achievements.find(
      (v) => v.definition.id === "contribution-10",
    );

    expect(view?.progress.current).toBe(10);
    expect(view?.progress.required).toBe(10);
  });

  it("counts rarities over the whole catalog", () => {
    const state = computeAchievementView([], new Set());
    const total = state.rarityCounts.common + state.rarityCounts.rare + state.rarityCounts.epic + state.rarityCounts.legendary;

    expect(total).toBe(ACHIEVEMENT_DEFINITIONS.length);
  });
});
