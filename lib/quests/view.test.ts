import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { completionKey } from "./completion";
import { QUEST_INDEX } from "./catalog";
import { computeQuestView, rewardLabel } from "./view";

function merged(id: string, occurredAt: string): DeveloperEvent {
  return {
    id,
    kind: "pull_request",
    developerLogin: "octocat",
    developerId: 1,
    repositoryId: 10,
    repositoryFullName: "octocat/hello",
    occurredAt,
    visibility: "public",
    confidence: "verified",
    sourceUrl: null,
    relevance: "scored",
    limitations: [],
    evidence: { number: 1, action: "merged", merged: true, testFiles: null, headRef: null, baseRef: null },
  } as unknown as DeveloperEvent;
}

const AT = new Date("2026-10-12T09:00:00.000Z");

describe("quest view (12.2)", () => {
  it("groups quests daily, then weekly, then goal", () => {
    const view = computeQuestView("user-1", [], AT);
    const kinds = view.quests.map((quest) => quest.definition.kind);

    const firstGoal = kinds.indexOf("goal");
    const lastWeekly = kinds.lastIndexOf("weekly");
    const lastDaily = kinds.lastIndexOf("daily");

    expect(lastDaily).toBeLessThan(firstGoal);
    expect(lastWeekly).toBeLessThan(firstGoal);
  });

  it("counts quests per kind", () => {
    const view = computeQuestView("user-1", [], AT);
    const total = view.counts.daily + view.counts.weekly + view.counts.goal;
    expect(total).toBe(view.quests.length);
    expect(view.counts.goal).toBeGreaterThan(0);
  });

  it("reports a met quest as claimable", () => {
    const view = computeQuestView("user-1", [merged("a", "2026-10-12T01:00:00.000Z")], AT);
    const daily = view.quests.find((quest) => quest.definition.id === "daily-merge-1");

    expect(daily?.claimable).toBe(true);
    expect(view.claimableCount).toBeGreaterThan(0);
  });

  it("does not report a completed quest as claimable", () => {
    const key = completionKey("user-1", "daily-merge-1", "daily:2026-10-12");
    const view = computeQuestView("user-1", [merged("a", "2026-10-12T01:00:00.000Z")], AT, new Set([key]));
    const daily = view.quests.find((quest) => quest.definition.id === "daily-merge-1");

    expect(daily?.completed).toBe(true);
    expect(daily?.claimable).toBe(false);
    expect(view.completedCount).toBe(1);
  });

  it("is empty-evidence honest: no events means no progress", () => {
    const view = computeQuestView("user-1", [], AT);
    expect(view.quests.every((quest) => quest.progress.current === 0)).toBe(true);
    expect(view.claimableCount).toBe(0);
  });

  it("labels a reward from its terms", () => {
    expect(rewardLabel(QUEST_INDEX.byId.get("daily-merge-1")!)).toBe("50 XP · 5 CodeCoins");
    expect(rewardLabel(QUEST_INDEX.byId.get("weekly-release-1")!)).toBe("200 XP · 20 CodeCoins · Cosmetic");
  });
});