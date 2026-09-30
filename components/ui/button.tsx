"use client";

import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/cn";

import {
  CONTROL_CURSOR,
  CONTROL_DISABLED,
  CONTROL_HEIGHT,
  CONTROL_ICON,
  CONTROL_PADDING,
  CONTROL_RADIUS,
  CONTROL_VARIANT,
  INTERACTION_TRANSITION,
  type ControlSize,
  type ControlVariant,
} from "./control";

/**
 * Loading indicator for {@link Button}.
 *
 * A single stroked arc in `currentColor`, so it inherits the variant's text
 * colour and never needs a colour of its own. It is decorative — the state is
 * announced through `aria-busy` — and it stops spinning when the user asks for
 * reduced motion (docs/DESIGN_SYSTEM.md §12).
 */
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0 animate-spin motion-reduce:animate-none", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="42 16"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type ButtonProps = {
  /** Treatment. Defaults to `primary`. */
  variant?: ControlVariant;
  /** Box size. Defaults to `md`, the 44px touch target. */
  size?: ControlSize;
  /**
   * Shows a spinner and blocks activation until the action settles. The button
   * stays focusable so the busy state is still reachable with a keyboard.
   */
  loading?: boolean;
  /** Stretches the button to its container — the mobile primary action. */
  fullWidth?: boolean;
} & Omit<ComponentPropsWithoutRef<"button">, "children"> & { children: ReactNode };

/**
 * The RootRealm action control.
 *
 * ```tsx
 * <Button>Save changes</Button>
 * <Button variant="secondary" size="sm">Preview</Button>
 * <Button variant="danger" loading={isDeleting}>Delete</Button>
 * <Button size="lg" fullWidth>Continue</Button>
 * ```
 *
 * Notes:
 * - it is always a real `<button>`; there is no `as` escape hatch, because a
 *   control that looks like a button must behave like one (DESIGN_SYSTEM §31)
 * - it is a client component: the loading state intercepts the click instead of
 *   using the native `disabled` attribute, so the control keeps focus (and the
 *   `aria-busy` announcement) while the action settles
 * - it knows nothing about the product. No XP, quests, achievements,
 *   CodeCoins or GitHub concepts may be added here
 * - the label is required, so the control always has an accessible name
 * - horizontal padding is size-keyed from `CONTROL_PADDING` (the spacing
 *   scale), so the inset cannot be forgotten per call — do not restate
 *   padding through `className` (`cn` cannot resolve conflicts)
 * - colour, border and hover all come from the variant; do not override them
 *   through `className` (`cn` cannot resolve conflicts — see lib/cn.ts)
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled = false,
  type = "button",
  onClick,
  className,
  children,
  ...rest
}: ButtonProps) {
  /**
   * A loading button is announced with `aria-busy` and keeps focus instead of
   * using the `disabled` attribute, which would drop it out of the tab order
   * mid-action. The click is therefore swallowed explicitly, which also stops a
   * double submit.
   */
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  }

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 text-label whitespace-nowrap select-none",
        CONTROL_HEIGHT[size],
        CONTROL_PADDING[size],
        CONTROL_RADIUS[size],
        CONTROL_VARIANT[variant],
        INTERACTION_TRANSITION,
        CONTROL_CURSOR,
        CONTROL_DISABLED,
        fullWidth && "w-full",
        className,
      )}
    >
      {loading ? <Spinner className={CONTROL_ICON[size]} /> : null}
      {children}
    </button>
  );
}
