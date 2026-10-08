"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import { QUESTS, type Quest } from "./quests-data";

function QuestProgress({ quest }: { quest: Quest }) {
  const percent = Math.min(100, Math.round((quest.progress / quest.target) * 100));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-label text-text-secondary">
        <span>{quest.progress}/{quest.target}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface">
        <div
          className={cn(
            "h-full rounded-full",
            quest.status === "completed" ? "bg-success" : quest.type === "weekly" ? "bg-accent" : "bg-text-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function QuestsScreen() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text variant="heading" as="h1" className="text-text-primary">
          Quests
        </Text>
        <Badge variant="neutral">3 active</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {QUESTS.map((quest) => (
          <Card key={quest.id} className="flex h-full flex-col gap-4 border-border bg-surface-secondary p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge
                variant={quest.status === "completed" ? "success" : quest.status === "ready" ? "accent" : "neutral"}
                size="sm"
              >
                {quest.type}
              </Badge>
              <Text variant="caption" className="text-text-muted">
                {quest.dueLabel}
              </Text>
            </div>

            <div className="space-y-2">
              <Text variant="subheading" as="h2" className="text-text-primary">
                {quest.title}
              </Text>
              <Text variant="body" className="text-text-secondary">
                {quest.description}
              </Text>
            </div>

            <QuestProgress quest={quest} />

            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
              <Text variant="label" className="text-text-secondary">
                Reward: {quest.reward}
              </Text>
              <Button variant={quest.status === "ready" ? "primary" : "secondary"} size="sm">
                {quest.status === "completed" ? "Claimed" : quest.status === "ready" ? "Claim" : "Continue"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
