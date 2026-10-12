import { describe, expect, it } from "vitest";

import { ACHIEVEMENT_DEFINITIONS } from "../achievements/definition";
import { QUEST_INDEX } from "../quests/catalog";

import {
  achievementReward,
  earnFromAchievement,
  earnFromQuestCompletion,
  earnRuleProblems,
  questReward,
  EARN_RULES_V1,
  type EarnRules,
} from "./earn";
import { balanceOf, type CurrencyTransaction } from "./ledger";

const AT = "2026-10-12T09:00:00.000Z";
const USER = "user-1";
const none = { has: () => false };
const dailyMerge = QUEST_INDEX.byId.get("daily-merge-1")!;

describe("earn rules (14.3)", () => {
  it("agrees with the achievement catalog", () => {
    expect(earnRuleProblems()).toEqual([]);
  });

  it("names an achievement the table pays nothing for", () => {
    const rules: EarnRules = { id: "test", achievementRewards: new Map([["first-merge", 5]]) };

    expect(earnRuleProblems(ACHIEVEMENT_DEFINITIONS, rules)).toContain(
      'Achievement "first-release" has no CodeCoin reward.',
    );
  });

  it("names a reward that points at no achievement", () => {
    const rules: EarnRules = { id: "test", achievementRewards: new Map([["frame-forge", 5]]) };

    expect(earnRuleProblems(ACHIEVEMENT_DEFINITIONS, rules)).toContain(
      'Reward for "frame-forge" names an achievement the catalog does not publish.',
    );
  });

  it("names a reward that is not a whole, non-negative amount", () => {
    const rules: EarnRules = { id: "test", achievementRewards: new Map([["first-merge", -5]]) };

    expect(earnRuleProblems([ACHIEVEMENT_DEFINITIONS[0]], rules)).toEqual([
      'Achievement "first-merge" has a non-integer or negative reward.',
    ]);
  });

  it("reads the quest's own declared reward", () => {
    expect(questReward(dailyMerge)).toBe(dailyMerge.codeCoinReward);
  });

  it("pays a milestone once, keyed by the achievement", () => {
    const entry = earnFromAchievement(
      { userId: USER, achievementId: "first-merge", recordedAt: AT },
      none,
    );

    expect(entry).toMatchObject({
      id: `cc:${USER}:achievement_reward:first-merge`,
      amount: achievementReward("first-merge"),
      reason: "achievement_reward",
      sourceId: "first-merge",
    });
  });

  it("pays a re-delivered unlock nothing", () => {
    const entry = earnFromAchievement(
      { userId: USER, achievementId: "first-merge", recordedAt: AT },
      { has: (key) => key === `cc:${USER}:achievement_reward:first-merge` },
    );

    expect(entry).toBeNull();
  });

  it("pays an unrewarded achievement nothing, without complaining", () => {
    const entry = earnFromAchievement(
      { userId: USER, achievementId: "not-in-the-table", recordedAt: AT },
      none,
    );

    expect(entry).toBeNull();
  });

  it("keys a quest reward by quest and period, so a daily pays once a day", () => {
    const today = earnFromQuestCompletion(
      { definition: dailyMerge, userId: USER, periodKey: "daily:2026-10-12", recordedAt: AT },
      none,
    );
    const tomorrow = earnFromQuestCompletion(
      { definition: dailyMerge, userId: USER, periodKey: "daily:2026-10-13", recordedAt: AT },
      none,
    );

    expect(today?.id).toBe(`cc:${USER}:quest_completion:daily-merge-1:daily:2026-10-12`);
    expect(tomorrow?.id).not.toBe(today?.id);
  });

  it("pays the same period once", () => {
    const entry = earnFromQuestCompletion(
      { definition: dailyMerge, userId: USER, periodKey: "daily:2026-10-12", recordedAt: AT },
      { has: (key) => key === `cc:${USER}:quest_completion:daily-merge-1:daily:2026-10-12` },
    );

    expect(entry).toBeNull();
  });

  it("accumulates quest and milestone rewards into one balance", () => {
    const entries = [
      earnFromAchievement({ userId: USER, achievementId: "contribution-10", recordedAt: AT }, none)!,
      earnFromQuestCompletion(
        { definition: dailyMerge, userId: USER, periodKey: "daily:2026-10-12", recordedAt: AT },
        none,
      )!,
    ];

    expect(balanceOf(entries, USER)).toBe(25 + dailyMerge.codeCoinReward);
  });

  it("grants coins only — never XP, skills or rank — from an award", () => {
    // SCORING §29. Structural: the return type has nowhere to put any of them.
    const entry: CurrencyTransaction | null = earnFromAchievement(
      { userId: USER, achievementId: "first-merge", recordedAt: AT },
      none,
    );

    expect(Object.keys(entry!).sort()).toEqual([
      "amount",
      "id",
      "reason",
      "recordedAt",
      "sourceId",
      "userId",
    ]);
  });

  it("keeps the reward table versioned so retuning does not rewrite history", () => {
    const retuned: EarnRules = {
      id: "earn-v2",
      achievementRewards: new Map([["first-merge", 500]]),
    };

    expect(achievementReward("first-merge", retuned)).toBe(500);
    expect(EARN_RULES_V1.id).toBe("earn-v1");
    expect(achievementReward("first-merge", EARN_RULES_V1)).toBe(5);
  });
});