"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import type { DeveloperEvent } from "@/lib/developer-event";
import { QUEST_KIND_LABEL, computeQuestView, rewardLabel, type QuestView } from "@/lib/quests/view";

export type QuestsScreenProps = {
  /**
   * The developer's normalized events.
   *
   * Empty until ingestion is wired to this route (the same state the skill tree
   * and achievements screens are in). With no events, every quest reports zero
   * evidence — which is honest about an empty history rather than a mock.
   */
  events?: readonly DeveloperEvent[];
  /** The signed-in user id. No account is wired yet, so a placeholder is used. */
  userId?: string;
  /** Completion ids already recorded (TASKS 12.3). */
  completedKeys?: readonly string[];
  /** Injectable clock, so the screen is deterministic in a test. */
  now?: Date;
  className?: string;
};

/**
 * The quests screen (TASKS 12.1–12.3).
 *
 * ```tsx
 * // app/quests/page.tsx
 * <QuestsScreen />
 * ```
 *
 * ## What changed from the prototype
 *
 * The Phase 2 screen was mock: a static `progress`/`target` pair per quest and a
 * "Log progress" button that incremented it, so a developer could advance a quest
 * by clicking. That button is gone. Progress is now a count over the developer's
 * normalized events (TASKS 12.2), so there is nothing to log — the quest moves
 * when the work happens, which is what "without fabricating evidence" (TASKS
 * 12.3) means in the UI.
 *
 * ## The three sections
 *
 * Quests are grouped daily, weekly and goal, because the window is the one thing
 * that differs between them and a reader needs to know whether the quest resets
 * tonight. A daily quest shows when its window closes; a goal does not, because
 * it does not reset.
 */
export function QuestsScreen({
  events = [],
  userId = "guest",
  completedKeys = [],
  now,
  className,
}: QuestsScreenProps) {
  const at = useMemo(() => now ?? new Date(), [now]);

  const state = useMemo(
    () => computeQuestView(userId, events, at, new Set(completedKeys)),
    [userId, events, at, completedKeys],
  );

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Text variant="heading" as="h1">
          Quests
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral" size="sm">
            {state.claimableCount} ready
          </Badge>
          <Badge variant="accent" size="sm">
            {state.completedCount} completed
          </Badge>
        </div>
      </header>

      <Text variant="body" className="max-w-2xl text-text-secondary">
        Quests track the same public activity the rest of RootRealm scores. Daily
        and weekly windows close on UTC boundaries; goals count your whole
        observed history.
      </Text>

      {state.quests.length === 0 ? (
        <Text variant="body" className="text-text-secondary">
          No quests are published yet.
        </Text>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {state.quests.map((quest) => (
            <QuestCard
              key={quest.definition.id}
              quest={quest}
              windowLabel={windowLabel(quest)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestCard({ quest, windowLabel }: { quest: QuestView; windowLabel: string }) {
  const { definition, progress } = quest;
  const tone = quest.completed ? "success" : quest.claimable ? "accent" : "neutral";

  return (
    <Card className="flex h-full flex-col gap-4 bg-surface-secondary">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={tone} size="sm">
          {QUEST_KIND_LABEL[definition.kind]}
        </Badge>
        <Text variant="caption" className="text-text-muted">
          {windowLabel}
        </Text>
      </div>

      <div className="flex flex-col gap-2">
        <Text variant="subheading" as="h2">
          {definition.title}
        </Text>
        <Text variant="body" className="text-text-secondary">
          {definition.description}
        </Text>
      </div>

      <ProgressBar
        label="Progress"
        value={progress.current}
        max={progress.required}
        showValue
        variant={quest.completed ? "neutral" : "accent"}
      />

      <div className="mt-auto flex flex-col gap-2 pt-1">
        <Text variant="label" className="text-text-secondary">
          {rewardLabel(definition)}
        </Text>
        <Text variant="caption" className="text-text-muted">
          {quest.completed
            ? "Completed this period. Claimed automatically when the work was observed."
            : quest.claimable
              ? "Ready to claim."
              : `${progress.current} of ${progress.required} counted from your observed activity.`}
        </Text>
      </div>
    </Card>
  );
}

/** When a quest's window closes, or that it does not. */
function windowLabel(quest: QuestView): string {
  const { definition, progress } = quest;

  if (definition.window === "lifetime") return "No deadline";
  if (progress.windowEnd === null) return "";

  const end = new Date(progress.windowEnd);
  const hours = Math.max(0, Math.round((end.getTime() - Date.now()) / 3_600_000));

  if (hours >= 24) return `${Math.round(hours / 24)}d left`;
  return `${hours}h left`;
}