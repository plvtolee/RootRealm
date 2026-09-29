import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

/** Bar thickness. Both come from the spacing scale. */
export type ProgressBarSize = "sm" | "md";

/** `accent` for progression, `neutral` for quiet background work. */
export type ProgressBarVariant = "accent" | "neutral";

const TRACK_SIZE: Record<ProgressBarSize, string> = {
  sm: "h-1",
  md: "h-2",
};

const FILL_VARIANT: Record<ProgressBarVariant, string> = {
  accent: "bg-accent",
  neutral: "bg-text-secondary",
};

export type ProgressBarProps = {
  /** Current value. Values outside `0 … max` are clamped. */
  value: number;
  /** Upper bound. Defaults to 100. */
  max?: number;
  /**
   * Visible label above the bar. It is also used as the accessible name; pass
   * `aria-labelledby` instead when the label lives in the surrounding markup.
   */
  label?: string;
  /** Shows `value / max` on the right of the label row. Defaults to false. */
  showValue?: boolean;
  /** Thickness. Defaults to `md` (8px). */
  size?: ProgressBarSize;
  /** Fill tone. Defaults to `accent`. */
  variant?: ProgressBarVariant;
  /** Layout only — the bar itself is always full width. */
  className?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "children">;

/**
 * Restrained progress bar: a flat fill on a secondary surface, pill-rounded,
 * with no glow or gradient (DESIGN_SYSTEM §9, §10).
 *
 * ```tsx
 * <ProgressBar label="Experience" value={3240} max={5000} showValue />
 * <ProgressBar aria-label="Uploading" value={40} size="sm" variant="neutral" />
 * ```
 *
 * Notes:
 * - semantics are a `progressbar` widget with `aria-valuemin` / `aria-valuemax`
 *   / `aria-valuenow`; give it a name with `label` or `aria-labelledby`
 * - the value is only read as data. The bar has no idea whether the number
 *   means XP, quest progress, reputation or a file upload
 * - a screen that needs richer value text ("3,240 / 5,000 XP") should compose
 *   its own label row and leave `showValue` off
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  size = "md",
  variant = "accent",
  className,
  ...rest
}: ProgressBarProps) {
  const { "aria-label": ariaLabel, ...trackProps } = rest;

  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const clampedValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const percentage = (clampedValue / safeMax) * 100;

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      {label || showValue ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-label text-text-secondary">{label}</span>
          {showValue ? (
            <span className="text-label text-text-muted">
              {clampedValue} / {safeMax}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        {...trackProps}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clampedValue}
        aria-label={ariaLabel ?? label}
        className={cn(
          "w-full overflow-hidden rounded-pill bg-surface-secondary",
          TRACK_SIZE[size],
        )}
      >
        <div
          /*
            A width transition, not the shared colour transition: the bar animates
            its fill on a value change, at the default UI duration, and stops
            moving when reduced motion is requested (DESIGN_SYSTEM §11, §12).
          */
          className={cn(
            "h-full rounded-pill transition-[width] duration-(--motion-base) ease-standard motion-reduce:transition-none",
            FILL_VARIANT[variant],
          )}
          /* The width is data, not a design value: it is the clamped value
             expressed as a percentage of the maximum. */
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
