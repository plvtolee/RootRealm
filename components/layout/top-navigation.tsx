"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import { Container } from "./container";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export type TopNavigationProps = {
  className?: string;
};

/** Five primary destinations are shared by the desktop header and mobile bar. */
export function TopNavigation({ className }: TopNavigationProps) {
  const pathname = usePathname();

  return (
    <header className={cn("sticky top-0 z-40 border-b border-border bg-bg", className)}>
      <Container className="flex h-(--control-height-md) items-center justify-between gap-4 lg:h-(--layout-header-height) lg:justify-start lg:gap-6">
        <Link
          href="/"
          className="flex items-center whitespace-nowrap text-heading text-text-primary transition-colors duration-(--motion-base) ease-standard hover:text-accent motion-reduce:transition-none"
        >
          RootRealm
        </Link>

        <nav aria-label="Primary navigation" className="hidden h-full items-stretch lg:flex">
          <ul className="flex items-stretch gap-2">
            {NAV_ITEMS.map(({ href, label }) => {
              const active = isNavActive(pathname, href);
              return (
                <li key={href} className="flex">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-full items-center whitespace-nowrap px-3 transition-colors duration-(--motion-base) ease-standard motion-reduce:transition-none",
                      active ? "border-b-emphasis border-accent text-accent" : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div aria-label="6 stars" className="hidden h-(--control-height-md) items-center gap-2 rounded-pill border border-border px-4 text-label text-text-secondary lg:flex">
            <span aria-hidden="true" className="text-accent-amber">*</span>
            <span>6</span>
          </div>
        </div>
      </Container>
    </header>
  );
}
