/**
 * RootRealm — the initial quest catalog (TASKS 12.1).
 *
 * ```text
 * daily, weekly and goal quests
 * ```
 *
 * A deliberately small starting catalog, like the achievement and skill catalogs:
 * a quest whose criterion cannot be counted from ingested events would report
 * zero progress forever, and a developer would be right to call that broken. So
 * every criterion here is a kind `lib/skills/evidence.ts` can count today —
 * merged pull requests, completed reviews, landed pushes, releases, documentation
 * — and nothing that depends on evidence the ingestion does not have yet.
 *
 * ## Why the counts are low
 *
 * A daily quest a developer cannot finish in a day is not a daily quest. The
 * daily counts are calibrated to a single working session; the weekly ones to a
 * working week; the goals to a milestone. They are starting values, not
 * measured — the same caveat the achievement thresholds carry.
 *
 * ## Why there is one cosmetic-reward quest
 *
 * TASKS 12.3 says a completion can grant a cosmetic. Having exactly one in the
 * starting catalog proves the reward path end to end without turning quests into
 * a second shop. Its id is the one `lib/cosmetics/catalog.ts` publishes as a
 * quest reward.
 */
import { indexQuests, type QuestDefinition } from "./definition";

/** The starting catalog. */
export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: "daily-merge-1",
    kind: "daily",
    window: "daily",
    title: "Merge a pull request",
    description: "Land one reviewed change today.",
    criterion: { kind: "merged_pull_requests", count: 1 },
    xpReward: 50,
    codeCoinReward: 5,
    cosmeticRewardId: null,
  },
  {
    id: "daily-review-1",
    kind: "daily",
    window: "daily",
    title: "Review a pull request",
    description: "Approve one change and keep the queue moving.",
    criterion: { kind: "completed_reviews", count: 1 },
    xpReward: 40,
    codeCoinReward: 5,
    cosmeticRewardId: null,
  },
  {
    id: "daily-push-1",
    kind: "daily",
    window: "daily",
    title: "Push code",
    description: "Land a commit on a branch today.",
    criterion: { kind: "landed_pushes", count: 1 },
    xpReward: 30,
    codeCoinReward: 3,
    cosmeticRewardId: null,
  },
  {
    id: "weekly-merge-5",
    kind: "weekly",
    window: "weekly",
    title: "Merge five pull requests",
    description: "A steady week of landing changes.",
    criterion: { kind: "merged_pull_requests", count: 5 },
    xpReward: 250,
    codeCoinReward: 25,
    cosmeticRewardId: null,
  },
  {
    id: "weekly-release-1",
    kind: "weekly",
    window: "weekly",
    title: "Publish a release",
    description: "Ship a version this week.",
    criterion: { kind: "published_releases", count: 1 },
    xpReward: 200,
    codeCoinReward: 20,
    cosmeticRewardId: "frame-forge",
  },
  {
    id: "weekly-docs-1",
    kind: "weekly",
    window: "weekly",
    title: "Write documentation",
    description: "Create a page of documentation this week.",
    criterion: { kind: "qualifying_documentation", count: 1 },
    xpReward: 150,
    codeCoinReward: 15,
    cosmeticRewardId: null,
  },
  {
    id: "goal-merge-50",
    kind: "goal",
    window: "lifetime",
    title: "Merge fifty pull requests",
    description: "A sustained record of landing reviewed work.",
    criterion: { kind: "merged_pull_requests", count: 50 },
    xpReward: 1_000,
    codeCoinReward: 100,
    cosmeticRewardId: null,
  },
  {
    id: "goal-release-10",
    kind: "goal",
    window: "lifetime",
    title: "Publish ten releases",
    description: "A long record of shipping versions.",
    criterion: { kind: "published_releases", count: 10 },
    xpReward: 800,
    codeCoinReward: 80,
    cosmeticRewardId: null,
  },
];

/** The catalog, indexed. */
export const QUEST_INDEX = indexQuests(QUEST_DEFINITIONS);