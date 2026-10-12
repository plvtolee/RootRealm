/**
 * RootRealm — CodeCoin earn rules (TASKS 14.3).
 *
 * ```text
 * a quest completion or a milestone unlock → one currency entry, or none
 * ```
 *
 * TASKS 14.3 is "connect quest/milestone rewards". Connecting them means two
 * things this module does: it decides *how many* coins an award is worth, and it
 * produces the ledger entry for it under the same idempotency key discipline as
 * every other award.
 *
 * ## Why rewards are policy here and not fields on the definitions
 *
 * A `codeCoinReward` on `QuestDefinition` is right — the quest catalog already
 * carries one, because the amount is part of what the quest *is*. An achievement
 * is different: `AchievementDefinition` deliberately has no reward field, because
 * TASKS 7.1 defines an achievement by its evidence and its rarity, and rarity is
 * display metadata (SCORING.md §27). Putting a price on the definition would make
 * a "legendary" achievement worth more coins and quietly turn rarity into an
 * economic axis. So the achievement rewards are a table here, keyed by id, and
 * `earnRuleProblems` is the check that the table and the catalog still agree.
 *
 * ## Why the rewards are versioned
 *
 * XP carries the scoring version that produced it (SCORING.md §3) so history is
 * never rewritten. The same applies here: if the coin economy is retuned, an
 * achievement already paid keeps the amount it was paid. Changing the value of
 * an award after the fact would make the ledger a record of whatever the economy
 * happened to be when each award was granted.
 *
 * ## What this module cannot grant
 *
 * SCORING.md §29: CodeCoins are cosmetic currency — not XP, not skill points,
 * not ranking points, not a quality score, and they cannot buy skill nodes. Every
 * function here returns a `CurrencyTransaction` or nothing; there is no return
 * type in which this module could produce XP or a skill unlock, so the rule is
 * structural rather than a check someone has to remember to write.
 */
import type { AchievementDefinition } from "../achievements/definition";
import { ACHIEVEMENT_DEFINITIONS } from "../achievements/definition";
import type { QuestDefinition } from "../quests/definition";

import {
  recordCurrencyTransaction,
  type CurrencyTransaction,
} from "./ledger";

/** The identifier of the earn rule set. Recorded on every award's context. */
export type EarnRulesId = string;

/** A versioned set of achievement rewards. */
export interface EarnRules {
  readonly id: EarnRulesId;
  /** CodeCoins per achievement id. An achievement absent from the map pays nothing. */
  readonly achievementRewards: ReadonlyMap<string, number>;
}

/**
 * The starting economy.
 *
 * Amounts scale with rarity because rarity is the only thing that separates a
 * milestone from another one — but note the direction of the claim: a rarer
 * milestone pays *more cosmetics currency*, which is a display ranking turned
 * into a small payout, not a progression ranking. They are starting values, to be
 * tuned against real earn rates rather than to be balanced here.
 */
export const EARN_RULES_V1: EarnRules = {
  id: "earn-v1",
  achievementRewards: new Map([
    ["first-merge", 5],
    ["first-release", 5],
    ["reviewer", 5],
    ["documentation-milestone", 5],
    ["contribution-10", 25],
    ["contribution-50", 75],
    ["contribution-100", 150],
  ]),
};

/**
 * The CodeCoins a milestone pays, or 0 when it pays nothing.
 *
 * Zero rather than null or a throw: "this achievement earns nothing" is a normal
 * answer, and a table that silently omits an entry should not turn into an
 * exception at the point a developer is being rewarded.
 */
export function achievementReward(
  achievementId: string,
  rules: EarnRules = EARN_RULES_V1,
): number {
  return rules.achievementRewards.get(achievementId) ?? 0;
}

/** The CodeCoins a quest pays, as declared by the quest itself. */
export function questReward(definition: QuestDefinition): number {
  return definition.codeCoinReward;
}

/** The ledger entries a caller already holds, so an award is not granted twice. */
export type ExistingKeys = { readonly has: (key: string) => boolean };

/**
 * The currency entry for a quest completion (TASKS 12.3).
 *
 * Keyed by quest and period, not by event: two different periods of a daily quest
 * are two different rewards, and the completion key that already gates the
 * completion is what stops the same period paying twice.
 *
 * Returns null for a quest that pays nothing and for a period already paid —
 * "nothing to grant" is the same answer for both, and neither is an error.
 */
export function earnFromQuestCompletion(
  input: {
    readonly definition: QuestDefinition;
    readonly userId: string;
    readonly periodKey: string;
    readonly recordedAt: string;
  },
  existing: ExistingKeys,
): CurrencyTransaction | null {
  return recordCurrencyTransaction(
    {
      userId: input.userId,
      amount: questReward(input.definition),
      reason: "quest_completion",
      sourceId: `${input.definition.id}:${input.periodKey}`,
      recordedAt: input.recordedAt,
    },
    existing,
  );
}

/**
 * The currency entry for an achievement unlock (TASKS 7.3).
 *
 * Keyed by the achievement alone, because an achievement is earned once ever —
 * there is no period to scope it to, which is exactly what distinguishes it from a
 * quest.
 */
export function earnFromAchievement(
  input: { readonly userId: string; readonly achievementId: string; readonly recordedAt: string },
  existing: ExistingKeys,
  rules: EarnRules = EARN_RULES_V1,
): CurrencyTransaction | null {
  return recordCurrencyTransaction(
    {
      userId: input.userId,
      amount: achievementReward(input.achievementId, rules),
      reason: "achievement_reward",
      sourceId: input.achievementId,
      recordedAt: input.recordedAt,
    },
    existing,
  );
}

/**
 * Every disagreement between the reward table and the achievement catalog.
 *
 * The two live in different files — a definition in `lib/achievements`, a price
 * in this module — and nothing else stops one from naming an achievement that does
 * not exist or an existing one that pays nothing by accident. Both are reported,
 * in the same spirit as `missingQuestRewardIds` in the cosmetic catalog.
 */
export function earnRuleProblems(
  achievements: readonly AchievementDefinition[] = ACHIEVEMENT_DEFINITIONS,
  rules: EarnRules = EARN_RULES_V1,
): readonly string[] {
  const problems: string[] = [];
  const catalogIds = new Set(achievements.map((achievement) => achievement.id));

  for (const achievement of achievements) {
    const reward = rules.achievementRewards.get(achievement.id);
    if (reward === undefined) {
      problems.push(`Achievement "${achievement.id}" has no CodeCoin reward.`);
    } else if (!Number.isInteger(reward) || reward < 0) {
      problems.push(`Achievement "${achievement.id}" has a non-integer or negative reward.`);
    }
  }

  for (const id of rules.achievementRewards.keys()) {
    if (!catalogIds.has(id)) {
      problems.push(`Reward for "${id}" names an achievement the catalog does not publish.`);
    }
  }

  return problems;
}