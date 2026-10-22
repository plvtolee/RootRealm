import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/reveal";

/**
 * Page transition foundation (Task 1.4).
 *
 * A `template` is re-mounted by the App Router on every navigation, which is
 * exactly what a page entrance needs: the animation replays when the route
 * changes and never when the shell re-renders.
 *
 * Notes:
 * - it remains a server component. `Reveal` is the narrow client boundary for
 *   the viewport-safe trigger; the transition itself is still one CSS
 *   animation (`--animate-page-slide` in `styles/tokens/motion.css`), so route
 *   changes use no animation library
 * - the token carries the duration and easing; primary navigation records the
 *   slide direction before a route swap, and under `prefers-reduced-motion`
 *   the same class resolves to a fade without movement (DESIGN_SYSTEM §12)
 * - the wrapper is a flex column that fills the shell's content region, so a
 *   screen can use `flex-1` inside it. It does not add spacing of its own: a
 *   screen owns its own vertical rhythm
 * - while the entrance runs, the animated transform makes this element a
 *   containing block for `position: fixed` descendants. Fixed UI (the
 *   navigation) therefore belongs in the layout, not inside a page
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <Reveal variant="page" className="flex flex-1 flex-col">
      {children}
    </Reveal>
  );
}
