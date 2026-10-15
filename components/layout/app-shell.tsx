"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import { BottomNavigation } from "./bottom-navigation";
import { Container } from "./container";
import { TopNavigation } from "./top-navigation";

export type AppShellProps = {
  children: ReactNode;
  /**
   * Wraps page content in the responsive Container. Turn it off for screens
   * that own their width, such as the skill tree canvas.
   */
  contained?: boolean;
  className?: string;
};

/**
 * Shared application chrome. The public root route is the one deliberate
 * exception: its landing page owns its full-bleed navigation, content regions,
 * and footer. Every other route keeps the existing app shell.
 */
export function AppShell({ children, contained = true, className }: AppShellProps) {
  const pathname = usePathname();

  if (pathname === "/") {
    return (
      <div className={cn("relative flex min-h-dvh flex-col", className)}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("relative flex min-h-dvh flex-col pb-16 lg:pb-0", className)}>
      <a
        href="#main-content"
        className="absolute top-0 left-4 z-50 inline-flex min-h-(--control-height-md) -translate-y-full items-center rounded-md border border-border bg-surface px-3 py-2 text-label text-text-primary shadow-md transition-transform duration-(--motion-fast) ease-standard focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to content
      </a>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-bg bg-linear-to-b from-bg-wash to-transparent"
      />

      <TopNavigation />

      <main
        id="main-content"
        tabIndex={-1}
        className="relative flex flex-1 flex-col py-6 outline-hidden md:py-8 lg:py-12"
      >
        {contained ? (
          <Container className="flex flex-1 flex-col">{children}</Container>
        ) : (
          children
        )}
      </main>

      <BottomNavigation />
    </div>
  );
}
