import { cn } from "@/lib/cn";

/** `horizontal` separates stacked content; `vertical` separates columns. */
export type DividerOrientation = "horizontal" | "vertical";

export type DividerProps = {
  /** Defaults to `horizontal`. */
  orientation?: DividerOrientation;
  /** Layout only — for example `my-4` between sections. */
  className?: string;
};

/**
 * Hairline separator built from the border tokens only — no gradient, no glow
 * (DESIGN_SYSTEM §8).
 *
 * ```tsx
 * <Divider />
 * <Divider className="my-6" />
 * <div className="flex h-16 items-center">
 *   <span>Left</span>
 *   <Divider orientation="vertical" className="mx-4" />
 *   <span>Right</span>
 * </div>
 * ```
 *
 * Notes:
 * - horizontal renders the semantic `<hr>` (an implicit `separator`)
 * - vertical renders a `separator` widget with `aria-orientation="vertical"`,
 *   and stretches to its flex parent, so give it a flex row with a height
 * - the component takes no children and no click handlers: a divider is never
 *   interactive
 */
export function Divider({ orientation = "horizontal", className }: DividerProps) {
  if (orientation === "vertical") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn("w-0 self-stretch border-l border-border", className)}
      />
    );
  }

  return <hr className={cn("w-full border-t border-border", className)} />;
}
