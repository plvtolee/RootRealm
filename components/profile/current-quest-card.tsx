import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import type { ProfileQuest } from "./profile-data";
import { BoxGlyph, CoinGlyph, StarGlyph } from "./profile-glyphs";

export type CurrentQuestCardProps = {
  quest: ProfileQuest;
  className?: string;
};

/**
 * Current Quest card from the approved reference (TASKS §2.1; PRD §5). Quests
 * themselves are later-scope product (PRD §17) — this is a static display of
 * one mock quest: title, description, progress snapshot and CodeCoin reward,
 * exactly as the reference draws it, with no quest engine behind it.
 *
 * Notes:
 * - progress is exposed as a named `progressbar` with min/max/now (AGENTS.md
 *   primitive rule 3); the visible "0/1" stays ordinary text so the row reads
 *   naturally and the bar does not double the announcement
 * - the CodeCoin amount uses the documented amber accent — one intentional,
 *   single-purpose use of a secondary accent (DESIGN_SYSTEM §3)
 */
export function CurrentQuestCard({ quest, className }: CurrentQuestCardProps) {
  return (
    <Card
      as="section"
      aria-labelledby="current-quest-heading"
      className={cn("flex flex-col gap-4", className)}
    >
      <Text variant="heading" as="h2" id="current-quest-heading">
        Current Quest
      </Text>

      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-md border border-border bg-surface-secondary"
        >
          <StarGlyph className="size-6 text-text-secondary" />
        </span>

        <div className="flex min-w-0 flex-col gap-1">
          <Text variant="subheading" as="h3">
            {quest.title}
          </Text>
          <Text variant="caption" className="text-text-secondary">
            {quest.description}
          </Text>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="flex shrink-0 items-center gap-2 text-text-secondary">
          <BoxGlyph className="size-4 shrink-0" />
          <span className="text-body text-text-primary">
            {quest.progress}/{quest.target}
          </span>
        </span>

        <ProgressBar
          value={quest.progress}
          max={quest.target}
          size="sm"
          aria-label="Quest progress"
          className="min-w-0 flex-1"
        />

        <span className="flex shrink-0 items-center gap-1 text-body text-accent-amber">
          <CoinGlyph className="size-4 shrink-0" />+{quest.rewardCoins}
          <span className="sr-only">CodeCoins reward</span>
        </span>
      </div>
    </Card>
  );
}
