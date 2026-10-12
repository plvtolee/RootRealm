import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { ACHIEVEMENT_DEFINITIONS } from "../achievements/definition";
import { synchronize, type SyncState } from "./engine";

const EMPTY: SyncState = { awardedKeys: new Set(), earnedAchievementIds: new Set() };

/** A merged pull request, the one event kind that both scores and counts. */
function merged(id: string, number = 1): DeveloperEvent {
  return {
    id,
    kind: "pull_request",
    developerLogin: "octocat",
    developerId: 1,
    repositoryId: 10,
    repositoryFullName: "octocat/hello",
    occurredAt: "2026-10-01T00:00:00.000Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: `https://github.com/octocat/hello/pull/${number}`,
    relevance: "scored",
    limitations: [],
    evidence: { number, action: "merged", merged: true, testFiles: null, headRef: null, baseRef: null },
  } as unknown as DeveloperEvent;
}

function sync(events: readonly DeveloperEvent[], state: SyncState = EMPTY) {
  return synchronize({
    developerLogin: "octocat",
    events,
    state,
    achievements: ACHIEVEMENT_DEFINITIONS,
    at: "2026-10-12T00:00:00.000Z",
  });
}

describe("initial synchronization (11.2)", () => {
  it("scores events into transactions and counters", () => {
    const outcome = sync([merged("a"), merged("b", 2)]);

    expect(outcome.transactions).toHaveLength(2);
    expect(outcome.counters.transactionsWritten).toBe(2);
    expect(outcome.counters.xpAwarded).toBeGreaterThan(0);
    expect(outcome.counters.eventsObserved).toBe(2);
    expect(outcome.counters.eventsNew).toBe(2);
    expect(outcome.counters.eventsDuplicate).toBe(0);
  });

  it("unlocks an achievement the evidence meets", () => {
    const outcome = sync([merged("a")]);

    expect(outcome.achievementUnlocks.map((u) => u.achievementId)).toContain("first-merge");
    expect(outcome.counters.achievementsUnlocked).toBeGreaterThan(0);
  });

  it("records the idempotency key for every transaction", () => {
    const outcome = sync([merged("a")]);

    for (const transaction of outcome.transactions) {
      expect(outcome.awardedKeys).toContain(transaction.id);
      expect(transaction.id).toMatch(/^xp:octocat:/);
    }
  });
});

describe("repeat synchronization (11.3)", () => {
  it("detects existing events and writes no XP for them", () => {
    const state = sync([merged("a")]);
    const again = sync([merged("a")], {
      awardedKeys: new Set(state.awardedKeys),
      earnedAchievementIds: new Set(state.earnedAchievementIds),
    });

    expect(again.transactions).toEqual([]);
    expect(again.counters.eventsNew).toBe(0);
    expect(again.counters.eventsDuplicate).toBe(1);
    expect(again.counters.xpAwarded).toBe(0);
  });

  it("does not unlock an achievement twice", () => {
    const state = sync([merged("a")]);
    const again = sync([merged("a")], {
      awardedKeys: new Set(state.awardedKeys),
      earnedAchievementIds: new Set(state.earnedAchievementIds),
    });

    expect(again.achievementUnlocks).toEqual([]);
    expect(again.counters.achievementsUnlocked).toBe(0);
    expect(again.earnedAchievementIds).toEqual(state.earnedAchievementIds);
  });

  it("is idempotent across three runs", () => {
    const first = sync([merged("a")]);
    const second = sync([merged("a")], {
      awardedKeys: new Set(first.awardedKeys),
      earnedAchievementIds: new Set(first.earnedAchievementIds),
    });
    const third = sync([merged("a")], {
      awardedKeys: new Set(second.awardedKeys),
      earnedAchievementIds: new Set(second.earnedAchievementIds),
    });

    expect(third.awardedKeys).toEqual(first.awardedKeys);
    expect(third.earnedAchievementIds).toEqual(first.earnedAchievementIds);
    expect(third.transactions).toEqual([]);
  });

  it("updates only newly observed activity", () => {
    const state = sync([merged("a")]);
    const again = sync([merged("a"), merged("b", 2)], {
      awardedKeys: new Set(state.awardedKeys),
      earnedAchievementIds: new Set(state.earnedAchievementIds),
    });

    expect(again.transactions).toHaveLength(1);
    expect(again.transactions[0]?.eventId).toBe("b");
    expect(again.counters.eventsNew).toBe(1);
    expect(again.counters.eventsDuplicate).toBe(1);
  });

  it("awards an achievement met across two syncs", () => {
    // A two-merge achievement is not met by one merge, and is met by the second.
    // Built here rather than taken from the catalog, so the test does not skip
    // if the catalog stops containing a two-count achievement.
    const definition = {
      id: "two-merges",
      title: "Two Merges",
      description: "Have two qualifying pull requests merged.",
      rarity: "common",
      criterion: { kind: "merged_pull_requests", count: 2 },
    } as (typeof ACHIEVEMENT_DEFINITIONS)[number];

    const first = synchronize({
      developerLogin: "octocat",
      events: [merged("a")],
      state: EMPTY,
      achievements: [definition],
      at: "2026-10-12T00:00:00.000Z",
    });
    expect(first.achievementUnlocks).toEqual([]);

    const second = synchronize({
      developerLogin: "octocat",
      events: [merged("a"), merged("b", 2)],
      state: { awardedKeys: new Set(first.awardedKeys), earnedAchievementIds: new Set() },
      achievements: [definition],
      at: "2026-10-13T00:00:00.000Z",
    });

    expect(second.achievementUnlocks.map((u) => u.achievementId)).toEqual([definition.id]);
  });

  it("treats a duplicate event inside one batch as a single award", () => {
    const outcome = sync([merged("a"), merged("a")]);

    expect(outcome.transactions).toHaveLength(1);
    expect(outcome.counters.eventsDuplicate).toBe(1);
  });
});

describe("determinism (11.2)", () => {
  it("produces the same outcome for the same inputs", () => {
    const events = [merged("a"), merged("b", 2)];
    expect(sync(events)).toEqual(sync(events));
  });

  it("does not read a clock: the same events and `at` give the same result", () => {
    const a = sync([merged("a")]);
    const b = sync([merged("a")]);
    expect(a.transactions[0]?.awardedAt).toBe(b.transactions[0]?.awardedAt);
  });
});