import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

import {
  CONTROL_CURSOR,
  CONTROL_DISABLED,
  CONTROL_HIT_AREA,
  CONTROL_ICON,
  CONTROL_RADIUS,
  CONTROL_SQUARE,
  CONTROL_VARIANT,
  INTERACTION_TRANSITION,
  type ControlSize,
  type ControlVariant,
} from "./control";

export type IconButtonProps = {
  /**
   * Accessible name — required. An icon-only control has no visible text, so
   * the name is the only thing a screen reader can announce
   * (docs/DESIGN_SYSTEM.md §31).
   */
  label: string;
  /** Treatment. Defaults to `ghost`, the quiet chrome-less icon action. */
  variant?: ControlVariant;
  /** Box size. Defaults to `md`, the 44px touch target. */
  size?: ControlSize;
  /** The icon. Decorative: `label` carries the meaning. */
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"button">, "children" | "aria-label">;

/**
 * Icon-only action control — for close, refresh, search and similar utilities.
 *
 * ```tsx
 * <IconButton label="Dismiss">
 *   <CloseIcon />
 * </IconButton>
 * ```
 *
 * Notes:
 * - `aria-label` is removed from the props on purpose: the name can only come
 *   from `label`, so the two cannot drift apart
 * - a single direct `<svg>` child is sized by the control (DESIGN_SYSTEM §26),
 *   so icons stay optically consistent without per-call sizing
 * - `size="sm"` keeps the 36px box but extends the touch area to 44px; keep
 *   `gap-2` between small icon buttons so the halos do not overlap
 * - never use this for a labelled action; use `Button` instead
 */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  type = "button",
  disabled = false,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        CONTROL_SQUARE[size],
        CONTROL_RADIUS[size],
        CONTROL_VARIANT[variant],
        INTERACTION_TRANSITION,
        CONTROL_CURSOR,
        CONTROL_DISABLED,
        size === "sm" && CONTROL_HIT_AREA,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center [&>svg]:size-full",
          CONTROL_ICON[size],
        )}
      >
        {children}
      </span>
    </button>
  );
}
