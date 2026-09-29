import type { ComponentType, ReactNode } from "react";

/**
 * The primary navigation destinations (TASKS §1.5, DESIGN_SYSTEM §22).
 *
 * This module is the single source of truth for the app's routes: the mobile
 * bottom bar (Task 1.5), the desktop navigation (Task 1.6) and anything else
 * that needs to link to a primary screen must read `NAV_ITEMS` instead of
 * restating hrefs, so the information architecture cannot drift apart.
 *
 * Routes are canonical and stable:
 *
 * | label        | href            |
 * | ------------ | --------------- |
 * | Home         | `/`             |
 * | Skill Tree   | `/skill-tree`   |
 * | Achievements | `/achievements` |
 * | Shop         | `/shop`         |
 * | Profile      | `/profile`      |
 *
 * Icons are inline SVG rather than a dependency: the project has no icon
 * package (see package.json), and DESIGN_SYSTEM §26 asks for simple geometric,
 * Lucide-style glyphs that share stroke weight and optical size — which is
 * exactly what {@link NavGlyph} standardizes.
 */

type NavIconProps = {
  className?: string;
};

/** One Lucide-style glyph: 24-unit grid, `currentColor` stroke, round joins. */
function NavGlyph({ className, children }: NavIconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

function HomeIcon({ className }: NavIconProps) {
  return (
    <NavGlyph className={className}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </NavGlyph>
  );
}

/** Branching tree: one root splitting upward into two nodes (DESIGN_SYSTEM §16). */
function SkillTreeIcon({ className }: NavIconProps) {
  return (
    <NavGlyph className={className}>
      <circle cx="6" cy="5" r="3" />
      <circle cx="18" cy="5" r="3" />
      <circle cx="12" cy="19" r="3" />
      <path d="M12 16v-4" />
      <path d="M12 12c0-3-2-4-4-5" />
      <path d="M12 12c0-3 2-4 4-5" />
    </NavGlyph>
  );
}

function AwardIcon({ className }: NavIconProps) {
  return (
    <NavGlyph className={className}>
      <circle cx="12" cy="8" r="6" />
      <path d="m15.5 12.9 1.5 9.1-5-3-5 3 1.5-9.1" />
    </NavGlyph>
  );
}

function ShoppingBagIcon({ className }: NavIconProps) {
  return (
    <NavGlyph className={className}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </NavGlyph>
  );
}

function UserIcon({ className }: NavIconProps) {
  return (
    <NavGlyph className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </NavGlyph>
  );
}

export type NavItem = {
  /** Canonical route. Do not invent new primary hrefs outside this table. */
  href: string;
  /** Visible and accessible destination name (TASKS §1.5 list, in order). */
  label: string;
  /** Geometric icon rendered by the nav bars; the bar owns its size. */
  icon: ComponentType<NavIconProps>;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/skill-tree", label: "Skill Tree", icon: SkillTreeIcon },
  { href: "/achievements", label: "Achievements", icon: AwardIcon },
  { href: "/shop", label: "Shop", icon: ShoppingBagIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

/**
 * Whether a destination is the current page.
 *
 * `/` matches only itself (every path starts with `/`), and a nested route
 * such as `/profile/edit` keeps `/profile` selected — the active state has to
 * survive sub-routes added after Phase 1.
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}