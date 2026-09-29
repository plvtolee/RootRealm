"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import { NAV_ITEMS, isNavActive } from "./nav-items";

export type BottomNavigationProps = {
  className?: string;
};

/**
 * The primary mobile navigation (TASKS §1.5, DESIGN_SYSTEM §22).
 *
 * ```tsx
 * // components/layout/app-shell.tsx — rendered once, after <main>
 * <BottomNavigation />
 * ```
 *
 * Notes:
 * - it is fixed to the viewport, so it lives in the layout and never inside a
 *   page: an animated `transform` on an ancestor (app/template.tsx fades every
 *   page in) would become the fixed element's containing block and drag the
 *   bar along with the transition
 * - it is hidden from `lg` up, where the desktop navigation (Task 1.6) takes
 *   over the same `NAV_ITEMS`; both are `display: none` outside their range,
 *   so only one is ever in the accessibility tree
 * - cells are content-sized (`flex-auto`), not equal fifths: at the 375px
 *   target an equal split leaves ~75px per item, which cannot hold
 *   "Achievements" at the 12px `label` role — and components may not name a
 *   font size. Content sizing keeps every label on one line with the slack
 *   distributed evenly
 * - styling follows DESIGN_SYSTEM §22: icon plus label, the selected
 *   destination in accent (`aria-current="page"` carries it programmatically),
 *   no glow (§10) and no motion beyond a colour transition (§11, §12)
 * - every cell clears the 44px touch target (§30) through
 *   `--control-height-md`, the same token the button primitives use
 */
export function BottomNavigation({ className }: BottomNavigationProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface py-1 lg:hidden",
        className,
      )}
    >
      <ul className="flex items-stretch">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isNavActive(pathname, href);

          return (
            <li key={href} className="flex flex-auto">
              {/*
                The colour classes are chosen in JS rather than layered:
                `hover:text-text-primary` must never be able to out-rank
                `text-accent` on the active item, and `cn` has no conflict
                resolution.
              */}
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-(--control-height-md) flex-auto flex-col items-center justify-center gap-1 px-2 text-label transition-colors duration-(--motion-base) ease-standard motion-reduce:transition-none",
                  active
                    ? "text-accent"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                <Icon className="size-(--icon-size-md) shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}