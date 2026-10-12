/**
 * RootRealm — the quest screen's view model (TASKS 12.2).
 *
 * ```text
 * QUEST_DEFINITIONS + events + a moment → QuestViewState (for the UI)
 * ```
 *
 * The same constraint the skill tree (6.6) and achievements (7.4) follow: the
 * screen consumes domain state and derives nothing itself. Quest progress is a
 * *count over evidence*, so the screen must not compute it — this module does,
 * once, using the counting rule the skill tree already uses.
 *
 * Presentation (icon, colour, ordering within a section) is not here. It lives
 * with the screen.
 */

import type { DeveloperEvent } from "../developer-event";
import { QUEST_DEFINITIONS } from "./catalog";
import type { QuestDefinition, QuestKind } from "./definition";
import { evaluateQuest, type QuestProgress } from "./progress";

/** One quest as the screen renders it. */
export interface QuestView {
  readonly definition: QuestDefinition;
  readonly progress: QuestProgress;
  /** Recorded as complete for this period (TASKS 12.3). */
  readonly completed: boolean;
  /** Met and not yet completed, so a claim is available now. */
  readonly claimable: boolean;
}

/** The whole quest screen's state for one developer. */
export interface QuestViewState {
  /** Daily quests first, then weekly, then goals. */
  readonly quests: readonly QuestView[];
  readonly counts: Readonly<Record<QuestKind, number>>;
  /** Quests met and unclaimed. */
  readonly claimableCount: number;
  /** Quests recorded complete this period. */
  readonly completedCount: number;
}

const KIND_ORDER: readonly QuestKind[] = ["daily", "weekly", "goal"];

/**
 * Derives the quest screen's state.
 *
 * `completedKeys` is the set of completion ids recorded (TASKS 12.3). A quest
 * counts as completed when it is recorded, not when its evidence currently
 * satisfies it — the same choice the achievement view makes, and for the same
 * reason: a completion is a fact about the past.
 */
export function computeQuestView(
  userId: string,
  events: readonly DeveloperEvent[],
  at: Date,
  completedKeys: ReadonlySet<string> = new Set(),
  definitions: readonly QuestDefinition[] = QUEST_DEFINITIONS,
): QuestViewState {
  const quests: QuestView[] = definitions.map((definition) => {
    const progress = evaluateQuest(definition, events, at);
    const completed = completedKeys.has(`quest:${userId}:${definition.id}:${progress.periodKey}`);

    return {
      definition,
      progress,
      completed,
      claimable: progress.met && !completed,
    };
  });

  quests.sort((a, b) => KIND_ORDER.indexOf(a.definition.kind) - KIND_ORDER.indexOf(b.definition.kind));

  const counts: Record<QuestKind, number> = { daily: 0, weekly: 0, goal: 0 };
  for (const quest of quests) counts[quest.definition.kind] += 1;

  return {
    quests,
    counts,
    claimableCount: quests.filter((quest) => quest.claimable).length,
    completedCount: quests.filter((quest) => quest.completed).length,
  };
}

/** A human label for a quest kind. */
export const QUEST_KIND_LABEL: Readonly<Record<QuestKind, string>> = {
  daily: "Daily",
  weekly: "Weekly",
  goal: "Goal",
};

/** A human label for a reward line, e.g. "50 XP · 5 CodeCoins". */
export function rewardLabel(definition: QuestDefinition): string {
  const parts: string[] = [];

  if (definition.xpReward > 0) parts.push(`${definition.xpReward.toLocaleString("en-US")} XP`);
  if (definition.codeCoinReward > 0) parts.push(`${definition.codeCoinReward.toLocaleString("en-US")} CodeCoins`);
  if (definition.cosmeticRewardId !== null) parts.push("Cosmetic");

  return parts.join(" · ");
}