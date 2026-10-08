"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import { NAV_ITEMS, isNavActive } from "./nav-items";

export type BottomNavigationProps = {
  className?: string;
};

/** The five primary mobile destinations, including the Profile entry. */
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
          const mobileLabel = label === "Leaderboard" ? "Ranks" : label;
          return (
            <li key={href} className="flex min-w-0 flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-(--control-height-md) min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-label transition-colors duration-(--motion-base) ease-standard motion-reduce:transition-none",
                  active ? "text-accent" : "text-text-secondary hover:text-text-primary",
                )}
              >
                <Icon className="size-(--icon-size-md) shrink-0" />
                <span className="truncate">{mobileLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
