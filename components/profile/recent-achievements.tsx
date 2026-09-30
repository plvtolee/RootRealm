import Link from "next/link";
import type { ComponentType } from "react";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import type { AchievementRarity, ProfileAchievement } from "./profile-data";
import { AwardGlyph, ShieldGlyph, SparkleGlyph, StarGlyph } from "./profile-glyphs";

export type RecentAchievementsProps = {
  achievements: readonly ProfileAchievement[];
  /** Count behind the "+N" tile. */
  moreCount: number;
  className?: string;
};

/**
 * Regular hexagon clip for the rarity tiles — the approved reference draws
 * achievements as hex badges. A clip path is geometry, not a design token:
 * colour, spacing and radius on the tile all come from the token system.
 */
const HEX =
  "[clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]";

/**
 * Rarity presentation. DESIGN_SYSTEM §19 says rarity affects accent and border
 * treatment but pins no hues, so this maps each tier onto colours the palette
 * already documents (DESIGN_SYSTEM §3/§4): silver monochrome for common, teal
 * for rare, the default violet accent for epic, gold for legendary — the same
 * four hues, in the same order, as the approved reference's achievement row.
 * The vocabulary itself belongs to the screen, not to `Badge`
 * (AGENTS.md primitive rule 5).
 */
const RARITY: Record<
  AchievementRarity,
  { frame: string; glyph: string; Glyph: ComponentType<{ className?: string }> }
> = {
  common: { frame: "bg-text-secondary", glyph: "text-text-secondary", Glyph: AwardGlyph },
  rare: { frame: "bg-accent-teal", glyph: "text-accent-teal", Glyph: ShieldGlyph },
  epic: { frame: "bg-accent", glyph: "text-accent", Glyph: SparkleGlyph },
  legendary: { frame: "bg-warning", glyph: "text-warning", Glyph: StarGlyph },
};

/**
 * Recent Achievements row (TASKS §2.1; DESIGN_SYSTEM §15 "Achievements",
 * §19 rarity; `references/approved-ui/profile.png`).
 *
 * Notes:
 * - each tile is a hex badge: a rarity-coloured frame with an inset surface
 *   hex, no glow (§10) and no animation (§12) — progression is what gets
 *   expressive later, not a resting screen (§33)
 * - tiles carry no visible names in the reference; each one gets an
 *   sr-only name + rarity so the list is readable to a screen reader (§31)
 * - the "+N" tile is a real link to the existing `/achievements` route
 */
export function RecentAchievements({
  achievements,
  moreCount,
  className,
}: RecentAchievementsProps) {
  return (
    <section
      aria-labelledby="recent-achievements-heading"
      className={cn("flex flex-col gap-4", className)}
    >
      <Text variant="heading" as="h2" id="recent-achievements-heading">
        Recent Achievements
      </Text>

      <ul className="flex flex-wrap items-center gap-3">
        {achievements.map((achievement) => {
          const { frame, glyph, Glyph } = RARITY[achievement.rarity];

          return (
            <li
              key={achievement.name}
              className={cn("relative size-16", frame, HEX)}
            >
              <span className="sr-only">
                {achievement.name} ({achievement.rarity})
              </span>
              <span
                aria-hidden="true"
                className={cn("absolute inset-1 grid place-items-center bg-surface", HEX)}
              >
                <Glyph className={cn("size-6", glyph)} />
              </span>
            </li>
          );
        })}

        <li>
          <Link
            href="/achievements"
            aria-label={`${moreCount} more achievements`}
            className={cn(
              "grid size-16 place-items-center rounded-md border border-border bg-surface text-heading text-text-secondary",
              "transition-colors duration-(--motion-fast) ease-standard hover:border-border-strong hover:bg-state-hover hover:text-text-primary motion-reduce:transition-none",
            )}
          >
            +{moreCount}
          </Link>
        </li>
      </ul>
    </section>
  );
}
