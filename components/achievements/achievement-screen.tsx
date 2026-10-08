"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import {
  ACHIEVEMENT_FILTERS,
  ACHIEVEMENT_RARITY_LABEL,
  MOCK_ACHIEVEMENTS,
  type Achievement,
  type AchievementRarity,
} from "./achievement-data";

type SortMode = "Newest" | "Oldest" | "Name" | "Rarity";

const RARITY_ORDER: Record<AchievementRarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  common: 3,
};

const RARITY_STYLE: Record<AchievementRarity, { tone: "neutral" | "accent" | "warning"; icon: string }> = {
  common: { tone: "neutral", icon: "✦" },
  rare: { tone: "accent", icon: "◈" },
  epic: { tone: "accent", icon: "✧" },
  legendary: { tone: "warning", icon: "✺" },
};

function AchievementCard({ achievement, index }: { achievement: Achievement; index: number }) {
  const rarity = RARITY_STYLE[achievement.rarity];

  return (
    <Card
      as="article"
      padding="md"
      className="group relative flex min-h-64 flex-col overflow-hidden transition-colors duration-(--motion-base) ease-standard hover:border-border-strong"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-secondary text-heading text-text-primary transition-colors duration-(--motion-base) ease-standard group-hover:border-border-strong",
            achievement.rarity === "legendary" && "text-warning",
            achievement.rarity === "epic" && "text-accent",
          )}
          aria-hidden="true"
        >
          <span>{achievement.icon}</span>
        </div>
        <Badge variant={rarity.tone} size="sm">{ACHIEVEMENT_RARITY_LABEL[achievement.rarity]}</Badge>
      </div>

      <div className="space-y-2">
        <Text variant="subheading" as="h3" className="text-text-primary">{achievement.title}</Text>
        <Text variant="body" className="text-text-secondary">{achievement.description}</Text>
      </div>

      <div className="mt-auto pt-6">
        <div className="mb-3 flex items-center justify-between gap-2 border-t border-border pt-3">
          <Text variant="caption" className="truncate text-text-muted">{achievement.source}</Text>
          <Text variant="caption" className="shrink-0 text-text-secondary">+{achievement.skillPoints} SP</Text>
        </div>
        <div className="flex items-center gap-2 text-text-muted">
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 shrink-0">
            <path d="M5 2.5v2M11 2.5v2M3 6h10M4 4h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <Text variant="caption">Earned {achievement.unlockedAt}</Text>
          <span className="ml-auto text-label text-text-disabled" aria-label={`Achievement ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
        </div>
      </div>
    </Card>
  );
}

export function AchievementScreen() {
  const [selectedFilter, setSelectedFilter] = useState<(typeof ACHIEVEMENT_FILTERS)[number]>("All");
  const [sortMode, setSortMode] = useState<SortMode>("Newest");
  const totalPoints = MOCK_ACHIEVEMENTS.reduce((sum, achievement) => sum + achievement.skillPoints, 0);
  const rarityCounts = useMemo(() => MOCK_ACHIEVEMENTS.reduce<Record<AchievementRarity, number>>((counts, item) => {
    counts[item.rarity] += 1;
    return counts;
  }, { common: 0, rare: 0, epic: 0, legendary: 0 }), []);

  const visibleAchievements = useMemo(() => {
    const filtered = selectedFilter === "All"
      ? [...MOCK_ACHIEVEMENTS]
      : MOCK_ACHIEVEMENTS.filter((achievement) => achievement.rarity === selectedFilter.toLowerCase());

    return filtered.sort((a, b) => {
      if (sortMode === "Name") return a.title.localeCompare(b.title);
      if (sortMode === "Rarity") return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      const dateOrder = a.unlockedAt.localeCompare(b.unlockedAt);
      return sortMode === "Newest" ? -dateOrder : dateOrder;
    });
  }, [selectedFilter, sortMode]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-6 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <Text variant="label" className="text-text-muted">COLLECTION / 01</Text>
          <Text variant="display" as="h1" className="text-text-primary">Achievements</Text>
          <Text variant="body" className="max-w-xl text-text-secondary">
            A record of the work, consistency, and knowledge you have built along the way.
          </Text>
        </div>
        <div className="flex items-end gap-8 lg:gap-12">
          <div>
            <Text variant="caption" className="mb-1 block text-text-muted">UNLOCKED</Text>
            <Text variant="heading" as="p" className="text-text-primary">{MOCK_ACHIEVEMENTS.length}<span className="text-text-muted"> / 24</span></Text>
          </div>
          <div>
            <Text variant="caption" className="mb-1 block text-text-muted">SKILL POINTS</Text>
            <Text variant="heading" as="p" className="text-text-primary">{totalPoints}<span className="text-text-muted"> SP</span></Text>
          </div>
        </div>
      </header>

      <section aria-labelledby="progress-heading" className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card padding="lg" className="flex flex-col justify-between gap-8">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Text variant="label" className="text-text-muted">YOUR JOURNEY</Text>
              <Text variant="subheading" as="h2" id="progress-heading" className="text-text-primary">The collection grows with you.</Text>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface-secondary text-text-secondary" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none" className="size-5"><path d="M10 2.5 12 7l4.8.5-3.6 3.2 1 4.8-4.2-2.4-4.2 2.4 1-4.8L3.2 7.5 8 7l2-4.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <Text variant="body" className="text-text-secondary">Overall completion</Text>
              <Text variant="caption" className="text-text-primary">{MOCK_ACHIEVEMENTS.length} of 24</Text>
            </div>
            <ProgressBar aria-label="Achievement collection completion" value={MOCK_ACHIEVEMENTS.length} max={24} size="sm" />
          </div>
        </Card>

        <Card variant="secondary" padding="lg" className="grid grid-cols-2 gap-x-6 gap-y-5">
          {(Object.keys(ACHIEVEMENT_RARITY_LABEL) as AchievementRarity[]).map((rarity) => (
            <div key={rarity} className="flex items-center gap-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-body", rarity === "legendary" && "text-warning", rarity === "epic" && "text-accent")} aria-hidden="true">{RARITY_STYLE[rarity].icon}</span>
              <div className="min-w-0">
                <Text variant="caption" className="block truncate text-text-muted">{ACHIEVEMENT_RARITY_LABEL[rarity]}</Text>
                <Text variant="subheading" as="p" className="text-text-primary">{String(rarityCounts[rarity]).padStart(2, "0")}</Text>
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section aria-labelledby="collection-heading" className="space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Text variant="heading" as="h2" id="collection-heading" className="text-text-primary">Unlocked</Text>
            <Text variant="caption" className="text-text-muted">Browse milestones by rarity and date earned.</Text>
          </div>
          <label className="flex min-h-(--control-height-md) items-center gap-3 self-start rounded-md border border-border bg-surface px-3 text-text-secondary md:self-auto">
            <Text variant="label" as="span" className="shrink-0 text-text-muted">SORT</Text>
            <select
              aria-label="Sort achievements"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="min-h-(--control-height-md) cursor-pointer bg-transparent pr-2 text-label text-text-primary outline-hidden"
            >
              <option>Newest</option><option>Oldest</option><option>Name</option><option>Rarity</option>
            </select>
          </label>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter achievements by rarity">
          {ACHIEVEMENT_FILTERS.map((filter) => {
            const active = selectedFilter === filter;
            const count = filter === "All" ? MOCK_ACHIEVEMENTS.length : rarityCounts[filter.toLowerCase() as AchievementRarity];
            return (
              <button
                key={filter}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedFilter(filter)}
                className={cn(
                  "inline-flex min-h-(--control-height-md) shrink-0 items-center gap-3 rounded-md border px-4 text-label transition-colors duration-(--motion-fast) ease-standard",
                  active ? "border-border-strong bg-surface-secondary text-text-primary" : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
                )}
              >
                {filter}<span className={cn("text-caption", active ? "text-text-secondary" : "text-text-muted")}>{String(count).padStart(2, "0")}</span>
              </button>
            );
          })}
        </div>

        {visibleAchievements.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleAchievements.map((achievement, index) => <AchievementCard key={achievement.id} achievement={achievement} index={index} />)}
          </div>
        ) : (
          <Card padding="lg" className="text-center">
            <Text variant="body" className="text-text-secondary">No achievements in this rarity yet.</Text>
          </Card>
        )}
      </section>
    </div>
  );
}
