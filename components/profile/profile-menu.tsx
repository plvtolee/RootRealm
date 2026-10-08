import Link from "next/link";

import { cn } from "@/lib/cn";

import {
  ActivityGlyph,
  AwardGlyph,
  BarsGlyph,
  ChevronGlyph,
  GridGlyph,
  TerminalGlyph,
} from "./profile-glyphs";

export type ProfileMenuProps = {
  className?: string;
};

/** One row's shared geometry: icon + name, 44px+ comfortable row (§30). */
const ROW = "flex items-center gap-3 px-3 py-3 text-body";

/**
 * The profile-local menu from `references/approved-ui/profile.png` (TASKS §2.1).
 *
 * ```tsx
 * // components/profile/profile-screen.tsx
 * <ProfileMenu className="lg:col-start-1 lg:row-start-2" />
 * ```
 *
 * Notes:
 * - it is a page-level `<nav>` labelled "Profile sections", distinct from the
 *   app's "Primary navigation" landmarks — it never replaces the approved top
 *   header or the mobile bottom bar (DESIGN_SYSTEM §22; Task 1.6)
 * - only Overview (this screen) and Achievements (`/achievements`) have real
 *   destinations. Repositories, Activity and Stats do not exist outside Phase 2,
 *   so they render as `aria-disabled` rows: present for visual parity with the
 *   reference, never as dead links (TASKS §0 reviewable state)
 * - the current row is a plain element with `aria-current="page"` — a link to
 *   the page you are already on would be a no-op stop in the tab order
 * - colour-only state changes, no motion beyond a transition (§11, §12)
 */
export function ProfileMenu({ className }: ProfileMenuProps) {
  return (
    <nav
      aria-label="Profile sections"
      className={cn("lg:self-start lg:border-r lg:border-border lg:pr-6", className)}
    >
      <ul className="flex flex-col gap-1">
        <li>
          <span
            aria-current="page"
            className={cn(
              ROW,
              "justify-between rounded-md border border-border bg-surface-secondary text-text-primary",
            )}
          >
            <span className="flex items-center gap-3">
              <GridGlyph className="size-4 shrink-0 text-text-secondary" />
              Overview
            </span>
            <ChevronGlyph className="size-4 shrink-0 text-text-secondary" />
          </span>
        </li>

        <li>
          <Link
            href="/achievements"
            className={cn(
              ROW,
              "rounded-md text-text-primary transition-colors duration-(--motion-fast) ease-standard hover:bg-state-hover motion-reduce:transition-none",
            )}
          >
            <AwardGlyph className="size-4 shrink-0 text-text-secondary" />
            Achievements
          </Link>
        </li>

        <li>
          <Link
            href="/quests"
            className={cn(
              ROW,
              "rounded-md text-text-primary transition-colors duration-(--motion-fast) ease-standard hover:bg-state-hover motion-reduce:transition-none",
            )}
          >
            <ActivityGlyph className="size-4 shrink-0 text-text-secondary" />
            Quests
          </Link>
        </li>

        <li>
          <Link
            href="/customization"
            className={cn(
              ROW,
              "rounded-md text-text-primary transition-colors duration-(--motion-fast) ease-standard hover:bg-state-hover motion-reduce:transition-none",
            )}
          >
            <BarsGlyph className="size-4 shrink-0 text-text-secondary" />
            Customization
          </Link>
        </li>

        <li>
          <span
            aria-disabled="true"
            className={cn(ROW, "text-text-secondary")}
          >
            <TerminalGlyph className="size-4 shrink-0 text-text-muted" />
            Repositories
          </span>
        </li>

        <li>
          <span
            aria-disabled="true"
            className={cn(ROW, "text-text-secondary")}
          >
            <ActivityGlyph className="size-4 shrink-0 text-text-muted" />
            Activity
          </span>
        </li>

        <li>
          <span
            aria-disabled="true"
            className={cn(ROW, "text-text-secondary")}
          >
            <BarsGlyph className="size-4 shrink-0 text-text-muted" />
            Stats
          </span>
        </li>
      </ul>
    </nav>
  );
}
