"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import { NAV_ITEMS, isNavActive } from "./nav-items";

export type BottomNavigationProps = {
  className?: string;
};

/**
 * The five primary mobile destinations (TASKS 1.5).
 *
 * Audit note (17.1, 17.2):
 *
 * - the accessible name comes from the visible text, not an `aria-label`. An
 *   `aria-label` that differs from the label on screen fails WCAG 2.5.3
 *   (Label in Name), and the icon is `aria-hidden` so the text alone is a
 *   complete name.
 * - each link is a real `<a>` with an `href`, so tab order, middle-click,
 *   "open in new tab" and the browser's link affordances all work with no
 *   key handling of our own (TASKS 17.2).
 * - `aria-current="page"` marks the active destination, and the active tint is
 *   accent *and* the current marker, never colour alone (DESIGN_SYSTEM §22).
 * - the bar is `display:none` from `lg`, so exactly one of the two navigation
 *   bars is ever exposed to assistive technology — not two identically named
 *   landmarks.
 */
export function BottomNavigation({ className }: BottomNavigationProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className={cn("fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface py-1 lg:hidden", className)}
    >
      <ul className="flex items-stretch">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <li key={href} className="flex min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-(--control-height-md) min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-label transition-colors duration-(--motion-base) ease-standard motion-reduce:transition-none",
                  active ? "text-accent" : "text-text-secondary hover:text-text-primary",
                )}
              >
                <Icon className="size-(--icon-size-md) shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}