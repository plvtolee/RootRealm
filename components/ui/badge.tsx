import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Badge tones. `default` and `neutral` are the monochrome chip; the remaining
 * four map onto the semantic state roles from `styles/tokens/color.css`.
 *
 * There is deliberately no rarity, attribute or product vocabulary here
 * (`rare`, `epic`, `builder`, ...): those are domain concepts that arrive with
 * their own tokens later, and a badge only needs to know which semantic role to
 * paint with.
 */
export type BadgeVariant =
  | "default"
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger";

/** Chip heights from `styles/tokens/component.css`. */
export type BadgeSize = "sm" | "md";

/** `rounded` is the badge radius; `pill` is for tag capsules. */
export type BadgeShape = "rounded" | "pill";

/**
 * Hairline border plus semantic text. Tints are not invented per variant —
 * `--color-state-selected` already exists for accent surfaces and the rest of
 * the palette stays monochrome at rest (DESIGN_SYSTEM §33) — so colour carries
 * meaning without lighting the interface up.
 */
const BADGE_VARIANT: Record<BadgeVariant, string> = {
  default: "border-border bg-surface-secondary text-text-primary",
  neutral: "border-border text-text-secondary",
  accent: "border-accent text-accent",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
};

const BADGE_SIZE: Record<BadgeSize, string> = {
  sm: "h-(--badge-height-sm) gap-1 px-2",
  md: "h-(--badge-height-md) gap-2 px-3",
};

const BADGE_SHAPE: Record<BadgeShape, string> = {
  rounded: "rounded-xs",
  pill: "rounded-pill",
};

export type BadgeProps = {
  variant?: BadgeVariant;
  size?: BadgeSize;
  shape?: BadgeShape;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"span">, "children">;

/**
 * Compact status chip.
 *
 * ```tsx
 * <Badge>Common</Badge>
 * <Badge variant="success" size="sm">Connected</Badge>
 * <Badge variant="warning" shape="pill">Pending sync</Badge>
 * ```
 *
 * Notes:
 * - the text role is `label` (status indicators, DESIGN_SYSTEM §5). It is not
 *   uppercased: the approved chips use sentence case, so `uppercase` stays an
 *   explicit choice at the call site
 * - a direct `<svg>` child is sized to the small icon size, like the approved
 *   chips, and ignores any per-call size
 * - it holds no product logic: whether something is "rare" is decided by the
 *   screen, the badge only receives a semantic tone
 */
export function Badge({
  variant = "default",
  size = "md",
  shape = "rounded",
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center border text-label whitespace-nowrap transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none [&>svg]:size-(--icon-size-sm) [&>svg]:shrink-0",
        BADGE_SIZE[size],
        BADGE_SHAPE[shape],
        BADGE_VARIANT[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
