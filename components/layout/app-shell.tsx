import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { BottomNavigation } from "./bottom-navigation";
import { Container } from "./container";

export type AppShellProps = {
  children: ReactNode;
  /**
   * Wraps the page content in the responsive {@link Container}. Turn it off for
   * a screen that owns its own width — the skill tree canvas is the one
   * documented case (DESIGN_SYSTEM §29).
   */
  contained?: boolean;
  className?: string;
};

/**
 * The RootRealm application shell (Task 1.4) — the frame every screen renders
 * inside.
 *
 * ```tsx
 * // app/layout.tsx
 * <body>
 *   <AppShell>{children}</AppShell>
 * </body>
 * ```
 *
 * Notes:
 * - it is rendered once by the root layout, so it is server-rendered and never
 *   remounts on navigation. Only the page inside it animates (app/template.tsx)
 * - it owns five things and nothing else: the global background, the skip link,
 *   the `<main>` landmark, the content container with the page rhythm, and the
 *   bottom navigation (Task 1.5) — chrome belongs in the layout, not inside a
 *   page, because a fixed element rendered within the template's animated
 *   transform would stop being viewport-fixed (see the note in
 *   components/layout/bottom-navigation.tsx)
 * - it knows nothing about the product. Screens, desktop navigation (Task 1.6)
 *   and data arrive in later tasks
 */
export function AppShell({ children, contained = true, className }: AppShellProps) {
  /*
    `pb-16` (64px) reserves the strip the fixed bottom bar occupies — the bar
    itself is ~53px tall — so the end of the page is never hidden underneath
    it. From `lg` the bar is gone and the space returns to the content.
  */
  return (
    <div className={cn("relative flex min-h-dvh flex-col pb-16 lg:pb-0", className)}>
      {/*
        Keyboard users reach the content straight away. It is translated above
        the viewport — not `sr-only` — so it can slide into place as a normal
        element on focus (DESIGN_SYSTEM §31: keyboard traversal).
      */}
      <a
        href="#main-content"
        className="absolute top-0 left-4 z-50 -translate-y-full rounded-md border border-border bg-surface px-3 py-2 text-label text-text-primary shadow-md transition-transform duration-(--motion-fast) ease-standard focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to content
      </a>

      {/*
        Global background (DESIGN_SYSTEM §27): the near-black base with one
        extremely subtle neutral wash at the top of the viewport. It is fixed,
        behind the content and inert, so it never affects scrolling or hit
        testing. No accent, no glow — §10 forbids glow as background decoration,
        and the browser chrome is tinted through `viewport.themeColor` in
        app/layout.tsx.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-bg bg-linear-to-b from-bg-wash to-transparent"
      />

      {/*
        `tabIndex={-1}` lets the skip link move focus here, which is what makes
        the link work in every screen reader; the outline is suppressed because
        this is a landmark, not a control. Vertical rhythm lives here so every
        screen starts with the same breathing room.
      */}
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

      {/*
        Primary navigation (TASKS §1.5, DESIGN_SYSTEM §22): fixed to the
        viewport below the content and hidden from `lg` up, where Task 1.6's
        desktop navigation takes over. It sits in the shell — outside the
        page — so app/template.tsx's animated transform can never become its
        containing block; the strip it covers is reserved by the shell's
        `pb-16`. It is placed after `<main>` so the DOM order matches the
        reading order (content first, the bar at the visual bottom).
      */}
      <BottomNavigation />
    </div>
  );
}
