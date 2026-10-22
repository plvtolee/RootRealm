import { describe, expect, it } from "vitest";

import { createInMemoryProgressionStore } from "./progression-store";
import type { DeveloperEvent } from "../developer-event";
import type { LedgerEntry } from "../scoring/ledger";
import type { AchievementUnlock } from "../achievements/unlock";
import type { SkillUnlock } from "../skills/unlock";

/**
 * TASKS 11.3 — the store's half of idempotency.
 *
 * The engine already refuses to award a key it has seen. These tests hold the
 * *store* to the same rule, because the two are independent: the engine's check
 * is in memory and could be wrong, while `xp_transactions.id` being the primary
 * key is enforced by the database. A bug in the first must not be able to
 * double-award anyone, which means the second has to hold on its own.
 */

const AT = "2026-10-14T00:00:00.000Z";

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "xp:octocat:push:1:v1",
    eventId: "push:1",
    developerLogin: "octocat",
    xp: 12,
    classification: "routine",
    reason: "Routine work",
    ruleId: "push.accepted",
    scoringVersionId: "v1",
    breakdown: [],
    ...overrides,
  } as LedgerEntry;
}

function unlock(overrides: Partial<AchievementUnlock> = {}): AchievementUnlock {
  return {
    developerLogin: "octocat",
    achievementId: "first-merge",
    unlockedAt: AT,
    scoringVersionId: "v1",
    evidenceEventIds: ["pr:1"],
    ...overrides,
  };
}

function skillUnlock(overrides: Partial<SkillUnlock> = {}): SkillUnlock {
  return {
    developerLogin: "octocat",
    skillId: "builder-roots",
    unlockedAt: AT,
    scoringVersionId: "scoring-v1",
    ruleId: "skill.builder-roots",
    ...overrides,
  };
}

describe("awardedKeys", () => {
  it("is empty for a developer who has never synced", async () => {
    const store = createInMemoryProgressionStore();
    expect((await store.awardedKeys("nobody")).size).toBe(0);
  });

  it("returns the keys that were actually written", async () => {
    const store = createInMemoryProgressionStore();
    await store.recordTransactions("u1", "octocat", [entry()]);

    expect((await store.awardedKeys("u1")).has("xp:octocat:push:1:v1")).toBe(true);
  });

  it("is scoped to one developer", async () => {
    const store = createInMemoryProgressionStore();
    await store.recordTransactions("u1", "octocat", [entry()]);

    // Two developers may legitimately have the same event id; the key includes
    // the login, and the store is keyed by user.
    expect((await store.awardedKeys("u2")).size).toBe(0);
  });
});

describe("recordTransactions", () => {
  it("writes a new award and reports it", async () => {
    const store = createInMemoryProgressionStore();
    expect(await store.recordTransactions("u1", "octocat", [entry()])).toBe(1);
    expect(await store.totalXp("u1")).toBe(12);
  });

  it("writes nothing the second time, and says so", async () => {
    const store = createInMemoryProgressionStore();
    await store.recordTransactions("u1", "octocat", [entry()]);

    // The whole guarantee. A second sync must not add XP.
    expect(await store.recordTransactions("u1", "octocat", [entry()])).toBe(0);
    expect(await store.totalXp("u1")).toBe(12);
  });

  it("awards only the new entries in a mixed batch", async () => {
    const store = createInMemoryProgressionStore();
    await store.recordTransactions("u1", "octocat", [entry()]);

    const written = await store.recordTransactions("u1", "octocat", [
      entry(),
      entry({ id: "xp:octocat:push:2:v1", eventId: "push:2", xp: 30 }),
    ]);

    expect(written).toBe(1);
    // 12 + 30: the duplicate was skipped rather than added.
    expect(await store.totalXp("u1")).toBe(42);
  });

  it("treats a different scoring version as a genuinely new award", async () => {
    const store = createInMemoryProgressionStore();
    await store.recordTransactions("u1", "octocat", [entry()]);

    // The version is part of the key on purpose (SCORING §3: history is not
    // rewritten). A re-score under v2 is a real award, not a duplicate.
    const written = await store.recordTransactions("u1", "octocat", [
      entry({ id: "xp:octocat:push:1:v2", eventId: "push:1", xp: 20 }),
    ]);

    expect(written).toBe(1);
    expect(await store.totalXp("u1")).toBe(32);
  });

  it("accepts an empty batch without writing anything", async () => {
    const store = createInMemoryProgressionStore();
    expect(await store.recordTransactions("u1", "octocat", [])).toBe(0);
  });
});

describe("recordAchievementUnlocks", () => {
  it("records an unlock once", async () => {
    const store = createInMemoryProgressionStore();
    expect(await store.recordAchievementUnlocks("u1", [unlock()])).toBe(1);
    expect((await store.earnedAchievementIds("u1")).has("first-merge")).toBe(true);
  });

  it("does not record the same achievement twice", async () => {
    const store = createInMemoryProgressionStore();
    await store.recordAchievementUnlocks("u1", [unlock()]);

    expect(await store.recordAchievementUnlocks("u1", [unlock()])).toBe(0);
  });

  it("keeps two developers' unlocks separate", async () => {
    const store = createInMemoryProgressionStore();
    await store.recordAchievementUnlocks("u1", [unlock()]);

    // The same achievement, earned by a different developer, is not a duplicate.
    expect(await store.recordAchievementUnlocks("u2", [unlock()])).toBe(1);
  });
});

describe("saveEvents", () => {
  const event = (id: string) =>
    ({ id, kind: "push", developerLogin: "octocat" }) as unknown as DeveloperEvent;

  it("reports how many were new", async () => {
    const store = createInMemoryProgressionStore();
    expect(await store.saveEvents("octocat", [event("push:1"), event("push:2")])).toBe(2);
  });

  it("does not re-store an event it already has", async () => {
    const store = createInMemoryProgressionStore();
    await store.saveEvents("octocat", [event("push:1")]);

    // Event identity is scoped to the occurrence, so a repeated observation of
    // the same id is the same fact, not a second one.
    expect(await store.saveEvents("octocat", [event("push:1")])).toBe(0);
  });
});

describe("skill unlock persistence", () => {
  it("round-trips learned ids for one developer", async () => {
    const store = createInMemoryProgressionStore();

    expect([...await store.learnedSkillIds("u1")]).toEqual([]);
    expect(await store.recordSkillUnlock("u1", skillUnlock())).toBe(1);
    expect([...await store.learnedSkillIds("u1")]).toEqual(["builder-roots"]);
  });

  it("is idempotent and scoped per developer", async () => {
    const store = createInMemoryProgressionStore();

    expect(await store.recordSkillUnlock("u1", skillUnlock())).toBe(1);
    expect(await store.recordSkillUnlock("u1", skillUnlock())).toBe(0);
    expect(await store.recordSkillUnlock("u2", skillUnlock())).toBe(1);
    expect([...await store.learnedSkillIds("u1")]).toEqual(["builder-roots"]);
    expect([...await store.learnedSkillIds("u2")]).toEqual(["builder-roots"]);
  });

  it("removes a learned id once and treats a repeat refund as a no-op", async () => {
    const store = createInMemoryProgressionStore();
    await store.recordSkillUnlock("u1", skillUnlock());

    expect(await store.removeSkillUnlock("u1", "builder-roots")).toBe(1);
    expect(await store.removeSkillUnlock("u1", "builder-roots")).toBe(0);
    expect([...await store.learnedSkillIds("u1")]).toEqual([]);
  });
});
