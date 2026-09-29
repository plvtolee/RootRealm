import type { ReactNode } from "react";

/**
 * Page transition foundation (Task 1.4).
 *
 * A `template` is re-mounted by the App Router on every navigation, which is
 * exactly what a page entrance needs: the animation replays when the route
 * changes and never when the shell re-renders.
 *
 * Notes:
 * - it is a server component. The transition is one CSS animation
 *   (`--animate-page-enter` in `styles/tokens/motion.css`), so route changes
 *   cost no JavaScript and no animation library
 * - the token carries the duration and easing; under `prefers-reduced-motion`
 *   the same class resolves to a fade without movement, so the information
 *   still appears (DESIGN_SYSTEM §12)
 * - the wrapper is a flex column that fills the shell's content region, so a
 *   screen can use `flex-1` inside it. It does not add spacing of its own: a
 *   screen owns its own vertical rhythm
 * - while the entrance runs, the animated transform makes this element a
 *   containing block for `position: fixed` descendants. Fixed UI (the
 *   navigation) therefore belongs in the layout, not inside a page
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col animate-page-enter">{children}</div>;
}
