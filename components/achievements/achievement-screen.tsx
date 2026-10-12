"use client";

import { useMemo, useState, useRef, useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AwardGlyph, ShieldGlyph, SparkleGlyph, StarGlyph } from "@/components/ui/content-glyphs";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { playAchievementReveal } from "@/lib/motion";
import type { DeveloperEvent } from "@/lib/developer-event";
import type { AchievementRarity } from "@/lib/achievements/definition";
import { computeAchievementView, type AchievementView } from "@/lib/achievements/view";

type SortMode = "Catalog" | "Name" | "Rarity";

const ACHIEVEMENT_FILTERS = ["All", "Common", "Rare", "Epic", "Legendary"] as const;

const ACHIEVEMENT_RARITY_LABEL: Record<AchievementRarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

const RARITY_ORDER: Record<AchievementRarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  common: 3,
};

const RARITY_STYLE: Record<AchievementRarity, { tone: "neutral" | "accent" | "warning"; icon: typeof AwardGlyph }> = {
  common: { tone: "neutral", icon: AwardGlyph },
  rare: { tone: "accent", icon: ShieldGlyph },
  epic: { tone: "accent", icon: SparkleGlyph },
  legendary: { tone: "warning", icon: StarGlyph },
};

function AchievementCard({
  view,
  index,
  revealing,
  onRevealEnd,
}: {
  view: AchievementView;
  index: number;
  revealing?: boolean;
  onRevealEnd?: () => void;
}) {
  const { definition, progress, earned } = view;
  const rarity = RARITY_STYLE[definition.rarity];
  const AchievementIcon = rarity.icon;
  const cardRef = useRef<HTMLDivElement | null>(null);

  /* Phase 3 (Task 3.4): GSAP drives the reveal so it re-triggers cleanly
     every time the card is marked revealing (the old CSS-class toggle
     fought React remounts). Reduced motion collapses to the final state. */
  useEffect(() => {
    if (!revealing || !cardRef.current) return;
    playAchievementReveal(cardRef.current, definition.rarity);
  }, [revealing, definition.rarity]);

  return (
    <Card
      ref={cardRef}
      as="article"
      padding="md"
      className={cn(
        "group relative flex min-h-(--achievement-card-min-height) flex-col overflow-hidden transition-colors duration-(--motion-base) ease-standard hover:border-border-strong motion-reduce:transition-none",
        !earned && "opacity-80",
      )}
      onAnimationEnd={revealing ? onRevealEnd : undefined}
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex size-(--achievement-icon-size) shrink-0 items-center justify-center rounded-lg border border-border bg-surface-secondary text-heading text-text-primary transition-colors duration-(--motion-base) ease-standard group-hover:border-border-strong motion-reduce:transition-none",
            definition.rarity === "legendary" && "text-warning",
            definition.rarity === "epic" && "text-accent",
          )}
          aria-hidden="true"
        >
          <AchievementIcon className="size-(--achievement-glyph-size)" />
        </div>
        <Badge variant={rarity.tone} size="sm">{ACHIEVEMENT_RARITY_LABEL[definition.rarity]}</Badge>
      </div>

      <div className="space-y-2">
        <Text variant="subheading" as="h3" className="text-text-primary">{definition.title}</Text>
        <Text variant="body" className="text-text-secondary">{definition.description}</Text>
      </div>

      <div className="mt-auto space-y-3 pt-6">
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Text variant="caption" className="text-text-muted">
            {earned ? "Earned" : `${progress.current} of ${progress.required}`}
          </Text>
          {/*
             (17.3) The index is decoration, not a name. `aria-label` on a plain
             span with no role is ignored by most screen readers and, where it is
             honoured, replaces "01" with "Achievement 01" — announcing the card's
             position twice over. The card's heading already says which achievement
             this is.
           */}
          <span aria-hidden="true" className="text-label text-text-disabled">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        {earned ? null : (
          <ProgressBar
            aria-label={`${definition.title} progress`}
            value={progress.current}
            max={progress.required}
            size="sm"
          />
        )}
      </div>
    </Card>
  );
}

export function AchievementScreen({
  events = [],
  earnedIds = [],
}: {
  /** The developer's normalized events. Empty until ingestion is wired. */
  events?: readonly DeveloperEvent[];
  /** Recorded achievement unlocks (TASKS 7.3). Empty until they are persisted. */
  earnedIds?: readonly string[];
}) {
  const [selectedFilter, setSelectedFilter] = useState<(typeof ACHIEVEMENT_FILTERS)[number]>("All");
  const [sortMode, setSortMode] = useState<SortMode>("Catalog");
  const [animating, setAnimating] = useState<ReadonlySet<string>>(new Set());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const state = useMemo(
    () => computeAchievementView(events, new Set(earnedIds)),
    [events, earnedIds],
  );

  const visibleAchievements = useMemo(() => {
    const filtered = selectedFilter === "All"
      ? [...state.achievements]
      : state.achievements.filter((view) => view.definition.rarity === selectedFilter.toLowerCase());

    return filtered.sort((a, b) => {
      if (sortMode === "Name") return a.definition.title.localeCompare(b.definition.title);
      if (sortMode === "Rarity") return RARITY_ORDER[a.definition.rarity] - RARITY_ORDER[b.definition.rarity];
      return 0;
    });
  }, [selectedFilter, sortMode, state]);

  function handleDemoReveal() {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    setAnimating(new Set());

    visibleAchievements.forEach((view, index) => {
      timersRef.current.push(
        setTimeout(() => {
          setAnimating((prev) => new Set([...prev, view.definition.id]));
          // Clear after animation completes
          setTimeout(() => {
            setAnimating((prev) => {
              const next = new Set(prev);
              next.delete(view.definition.id);
              return next;
            });
          }, 600);
        }, index * 200)
      );
    });
  }

  // Cleanup timers on unmount or when visibleAchievements changes
  useEffect(() => () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, [visibleAchievements]);

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
            <Text variant="heading" as="p" className="text-text-primary">
              {state.earnedCount}<span className="text-text-muted"> / {state.totalCount}</span>
            </Text>
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
            <div className="flex size-(--achievement-summary-icon-size) shrink-0 items-center justify-center rounded-md border border-border bg-surface-secondary text-text-secondary" aria-hidden="true">
              <StarGlyph className="size-(--icon-size-md)" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <Text variant="body" className="text-text-secondary">Overall completion</Text>
              <Text variant="caption" className="text-text-primary">{state.earnedCount} of {state.totalCount}</Text>
            </div>
            <ProgressBar aria-label="Achievement collection completion" value={state.earnedCount} max={state.totalCount} size="sm" />
          </div>
        </Card>

        <Card variant="secondary" padding="lg" className="grid grid-cols-2 gap-x-6 gap-y-5">
          {(Object.keys(ACHIEVEMENT_RARITY_LABEL) as AchievementRarity[]).map((rarity) => (
            <div key={rarity} className="flex items-center gap-3">
              <span className={cn("flex size-(--achievement-rarity-icon-size) shrink-0 items-center justify-center rounded-md border border-border bg-surface", rarity === "legendary" && "text-warning", rarity === "epic" && "text-accent")} aria-hidden="true">
                {(() => {
                  const RarityIcon = RARITY_STYLE[rarity].icon;
                  return <RarityIcon className="size-(--icon-size-md)" />;
                })()}
              </span>
              <div className="min-w-0">
                <Text variant="caption" className="block truncate text-text-muted">{ACHIEVEMENT_RARITY_LABEL[rarity]}</Text>
                <Text variant="subheading" as="p" className="text-text-primary">{String(state.rarityCounts[rarity]).padStart(2, "0")}</Text>
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section aria-labelledby="collection-heading" className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Text variant="heading" as="h2" id="collection-heading" className="text-text-primary">Collection</Text>
            <Text variant="caption" className="text-text-muted">Browse achievements by rarity and progress.</Text>
          </div>
          <label className="flex min-h-(--control-height-md) items-center gap-3 self-start rounded-md border border-border bg-surface px-3 text-text-secondary md:self-auto">
            <Text variant="label" as="span" className="shrink-0 text-text-muted">SORT</Text>
            <select
              aria-label="Sort"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="min-h-(--control-height-md) cursor-pointer bg-transparent pr-2 text-label text-text-primary outline-hidden"
            >
              <option value="Catalog">Catalog</option><option value="Name">Name</option><option value="Rarity">Rarity</option>
            </select>
          </label>
          {process.env.NODE_ENV !== "production" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDemoReveal}
              disabled={animating.size > 0}
              className="shrink-0"
            >
              Demo Reveal
            </Button>
          ) : null}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter achievements by rarity">
          {ACHIEVEMENT_FILTERS.map((filter) => {
            const active = selectedFilter === filter;
            const count = filter === "All" ? state.totalCount : state.rarityCounts[filter.toLowerCase() as AchievementRarity];
            return (
              <button
                key={filter}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedFilter(filter)}
                className={cn(
                  "inline-flex min-h-(--control-height-md) shrink-0 items-center gap-3 rounded-md border px-4 text-label transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
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
            {visibleAchievements.map((view, index) => {
              const isAnimating = animating.has(view.definition.id);
              return (
                <AchievementCard
                  key={`${view.definition.id}-${isAnimating ? "r" : "s"}`}
                  view={view}
                  index={index}
                  revealing={isAnimating}
                />
              );
            })}
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
