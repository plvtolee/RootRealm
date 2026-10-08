"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";

import { QUESTS, type Quest } from "./quests-data";

type QuestState = Pick<Quest, "progress" | "status">;

export function QuestsScreen() {
  const [quests, setQuests] = useState<Record<string, QuestState>>(
    Object.fromEntries(QUESTS.map(({ id, progress, status }) => [id, { progress, status }])),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const activeCount = Object.values(quests).filter(({ status }) => status === "active").length;

  function advanceQuest(quest: Quest) {
    const current = quests[quest.id];
    if (current.status === "ready") {
      setQuests((previous) => ({ ...previous, [quest.id]: { ...current, status: "completed" } }));
      setNotice(`${quest.reward} claimed for “${quest.title}”.`);
      return;
    }

    const progress = Math.min(current.progress + 1, quest.target);
    const status = progress >= quest.target ? "ready" : "active";
    setQuests((previous) => ({ ...previous, [quest.id]: { progress, status } }));
    setNotice(status === "ready" ? `${quest.title} complete. Your reward is ready to claim.` : `Progress updated for “${quest.title}”.`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text variant="heading" as="h1" className="text-text-primary">Quests</Text>
        <Badge variant="neutral">{activeCount} active</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {QUESTS.map((quest) => {
          const state = quests[quest.id];
          const isCompleted = state.status === "completed";
          const isReady = state.status === "ready";

          return (
            <Card key={quest.id} className="flex h-full flex-col gap-4 border-border bg-surface-secondary p-4">
              <div className="flex items-center justify-between gap-3">
                <Badge variant={isCompleted ? "success" : isReady ? "accent" : "neutral"} size="sm">
                  {quest.type}
                </Badge>
                <Text variant="caption" className="text-text-muted">{quest.dueLabel}</Text>
              </div>

              <div className="space-y-2">
                <Text variant="subheading" as="h2" className="text-text-primary">{quest.title}</Text>
                <Text variant="body" className="text-text-secondary">{quest.description}</Text>
              </div>

              <ProgressBar
                label="Progress"
                value={state.progress}
                max={quest.target}
                showValue
                variant={isCompleted ? "neutral" : "accent"}
              />

              <div className="mt-auto space-y-3 pt-1">
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <Text variant="label" className="text-text-secondary">Reward preview</Text>
                  <Text variant="caption" className="mt-1 text-text-muted">{quest.rewardPreview}</Text>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Text variant="label" className="text-text-secondary">Reward: {quest.reward}</Text>
                  <Button
                    variant={isReady ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => advanceQuest(quest)}
                    disabled={isCompleted}
                  >
                    {isCompleted ? "Claimed" : isReady ? "Claim reward" : "Log progress"}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div aria-live="polite" className="min-h-(--shop-notice-min-height)">
        {notice ? <Text variant="caption" className="text-text-secondary">{notice} (mock session state)</Text> : null}
      </div>
    </div>
  );
}
