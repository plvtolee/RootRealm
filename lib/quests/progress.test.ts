import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { QUEST_DEFINITIONS, QUEST_INDEX } from "./catalog";
import { indexQuests, validateQuestCatalog } from "./definition";
import {
  evaluateQuest,
  eventsInWindow,
  periodKeyFor,
  windowBounds,
} from "./progress";

/** A merged pull request at a given UTC instant. */
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

/** A merged pull request with no timestamp. */
function mergedNoDate(id: string): DeveloperEvent {
  return { ...merged(id, "2026-10-12T00:00:00.000Z"), occurredAt: null } as DeveloperEvent;
}

// 2026-10-12 is a Monday.
const MONDAY = new Date("2026-10-12T09:00:00.000Z");
const TUESDAY = new Date("2026-10-13T09:00:00.000Z");
const NEXT_MONDAY = new Date("2026-10-19T09:00:00.000Z");

describe("quest catalog (12.1)", () => {
  it("has daily, weekly and goal quests", () => {
    const kinds = new Set(QUEST_DEFINITIONS.map((q) => q.kind));
    expect(kinds).toEqual(new Set(["daily", "weekly", "goal"]));
  });

  it("validates cleanly", () => {
    expect(validateQuestCatalog(QUEST_DEFINITIONS)).toEqual([]);
  });

  it("rejects a duplicate id", () => {
    const duplicate = [QUEST_DEFINITIONS[0], QUEST_DEFINITIONS[0]] as typeof QUEST_DEFINITIONS;
    expect(() => indexQuests(duplicate)).toThrow(/Duplicate quest id/);
  });

  it("rejects a goal that resets, and a daily quest that does not", () => {
    const problems = validateQuestCatalog([
      { ...QUEST_DEFINITIONS[0], id: "bad-goal", kind: "goal", window: "daily" } as never,
      { ...QUEST_DEFINITIONS[0], id: "bad-daily", kind: "daily", window: "lifetime" } as never,
    ]);

    expect(problems.some((p) => p.includes("bad-goal"))).toBe(true);
    expect(problems.some((p) => p.includes("bad-daily"))).toBe(true);
  });
});

describe("period keys (12.2)", () => {
  it("keys a day as its UTC date", () => {
    expect(periodKeyFor("daily", MONDAY)).toBe("daily:2026-10-12");
  });

  it("keys a week by its Monday", () => {
    expect(periodKeyFor("weekly", MONDAY)).toBe("weekly:2026-10-12");
    expect(periodKeyFor("weekly", TUESDAY)).toBe("weekly:2026-10-12");
    expect(periodKeyFor("weekly", NEXT_MONDAY)).toBe("weekly:2026-10-19");
  });

  it("gives a lifetime goal a constant key", () => {
    expect(periodKeyFor("lifetime", MONDAY)).toBe("lifetime");
    expect(periodKeyFor("lifetime", NEXT_MONDAY)).toBe("lifetime");
  });

  it("puts Sunday in the week that began six days earlier", () => {
    // 2026-10-18 is a Sunday; its ISO week begins Monday 2026-10-12.
    expect(periodKeyFor("weekly", new Date("2026-10-18T23:00:00.000Z"))).toBe("weekly:2026-10-12");
  });
});

describe("window bounds (12.2)", () => {
  it("bounds a day at UTC midnight", () => {
    const bounds = windowBounds("daily", MONDAY);
    expect(bounds?.start.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });

  it("bounds a week Monday to Monday", () => {
    const bounds = windowBounds("weekly", TUESDAY);
    expect(bounds?.start.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("gives a lifetime goal no bounds", () => {
    expect(windowBounds("lifetime", MONDAY)).toBeNull();
  });
});

describe("windowed counting (12.2)", () => {
  const dailyMerge = QUEST_INDEX.byId.get("daily-merge-1")!;
  const goalMerge = QUEST_INDEX.byId.get("goal-merge-50")!;

  it("counts only events inside the daily window", () => {
    const events = [
      merged("a", "2026-10-12T01:00:00.000Z"),
      merged("b", "2026-10-13T01:00:00.000Z"),
    ];

    expect(evaluateQuest(dailyMerge, events, MONDAY).current).toBe(1);
    expect(evaluateQuest(dailyMerge, events, TUESDAY).current).toBe(1);
  });

  it("counts a lifetime goal across all windows", () => {
    const events = [
      merged("a", "2026-10-12T01:00:00.000Z"),
      merged("b", "2026-01-01T01:00:00.000Z"),
    ];

    expect(evaluateQuest(goalMerge, events, MONDAY).current).toBe(2);
  });

  it("excludes an untimestamped event from a bounded window but not from a goal", () => {
    const events = [mergedNoDate("a")];

    expect(evaluateQuest(dailyMerge, events, MONDAY).current).toBe(0);
    expect(evaluateQuest(goalMerge, events, MONDAY).current).toBe(1);
  });

  it("clamps progress to the target but keeps `met` correct", () => {
    const events = Array.from({ length: 60 }, (_, i) => merged(`e${i}`, "2026-05-01T00:00:00.000Z"));
    const progress = evaluateQuest(goalMerge, events, MONDAY);

    expect(progress.required).toBe(50);
    expect(progress.current).toBe(50);
    expect(progress.met).toBe(true);
  });

  it("is not met below the target", () => {
    const progress = evaluateQuest(goalMerge, [merged("a", "2026-05-01T00:00:00.000Z")], MONDAY);
    expect(progress.met).toBe(false);
  });

  it("reports the window bounds alongside the count", () => {
    const progress = evaluateQuest(dailyMerge, [], MONDAY);
    expect(progress.windowStart).toBe("2026-10-12T00:00:00.000Z");
    expect(progress.windowEnd).toBe("2026-10-13T00:00:00.000Z");
    expect(progress.periodKey).toBe("daily:2026-10-12");
  });

  it("returns the events unchanged for a lifetime window", () => {
    const events = [merged("a", "2020-01-01T00:00:00.000Z")];
    expect(eventsInWindow(events, "lifetime", MONDAY)).toBe(events);
  });
});