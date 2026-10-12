import type { ComponentType, ReactNode } from "react";

/**
 * The primary navigation destinations (TASKS 1.5, DESIGN_SYSTEM §22).
 *
 * This module is the single source of truth for the app's primary routes: the
 * mobile bottom bar (Task 1.5), the desktop navigation (Task 1.6) and anything
 * else that needs to link to a primary screen must read `NAV_ITEMS` instead of
 * restating hrefs, so the information architecture cannot drift apart.
 *
 * The list is TASKS 1.5's, in its order and no longer: Home, Skill Tree,
 * Achievements, Shop, Profile. The Phase 17 audit (17.1) is what caught that
 * Achievements had been dropped in favour of Leaderboard — a five-slot mobile bar
 * is a design decision (DESIGN_SYSTEM §22), and quietly trading a specified
 * destination for an unspecified one is how an architecture drifts. The secondary
 * destinations (Leaderboard, Quests, Customization) are reachable from the
 * profile menu, which is where "everything about one developer" belongs.
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

function ProfileIcon({ className }: NavIconProps) {
  return (
    <NavGlyph className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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

function AwardIcon({ className }: NavIconProps) {
  return (
    <NavGlyph className={className}>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" />
    </NavGlyph>
  );
}

export type NavItem = {
  /** Canonical route. Do not invent new primary hrefs outside this table. */
  href: string;
  /**
   * Visible and accessible destination name.
   *
   * One string for both, deliberately. The mobile bar once shortened this to
   * "Ranks" while announcing "Leaderboard", which breaks WCAG 2.5.3 (Label in
   * Name): the accessible name has to contain what the user can see.
   */
  label: string;
  /** Geometric icon rendered by the nav bars; the bar owns its size. */
  icon: ComponentType<NavIconProps>;
};

/**
 * TASKS 1.5's five destinations, in order.
 *
 * `aria-current="page"` is applied per item by the bars, and `isNavActive`
 * decides which — the array itself carries no state, so it can be read by a
 * server component, a test, or anything else without pretending to know the
 * current route.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/skill-tree", label: "Skill Tree", icon: SkillTreeIcon },
  { href: "/achievements", label: "Achievements", icon: AwardIcon },
  { href: "/shop", label: "Shop", icon: ShoppingBagIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
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