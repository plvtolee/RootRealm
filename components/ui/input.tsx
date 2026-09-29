"use client";

import { useId, type ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

import { CONTROL_HEIGHT, INTERACTION_TRANSITION } from "./control";

/**
 * Every surface, border and text colour a field can have comes from exactly one
 * branch below, so two classes can never fight over the same property. `cn`
 * does no conflict resolution (lib/cn.ts) and Tailwind emits conflicting
 * utilities in stylesheet order, not class order.
 */
function fieldTone({ error, disabled }: { error: boolean; disabled: boolean }): string {
  if (disabled) {
    return "border-border bg-surface-secondary text-text-disabled placeholder:text-text-disabled cursor-not-allowed";
  }

  if (error) {
    return "border-danger bg-surface text-text-primary placeholder:text-text-muted focus-visible:border-danger";
  }

  return "border-border bg-surface text-text-primary placeholder:text-text-muted focus-visible:border-accent";
}

export type InputProps = {
  /**
   * Visible label. Required: a field without a programmatically associated
   * label is unusable with a screen reader (DESIGN_SYSTEM §25, §31).
   */
  label: string;
  /** Supporting text under the field. Replaced by `error` when both are set. */
  hint?: string;
  /** Validation message. Sets `aria-invalid` and the danger border. */
  error?: string;
} & Omit<ComponentPropsWithoutRef<"input">, "children">;

/**
 * Single-line text field with its label, hint and error state.
 *
 * ```tsx
 * <Input label="GitHub username" placeholder="plvtolee" />
 * <Input label="Email" type="email" hint="Used for sign-in only." />
 * <Input label="Email" type="email" error="Enter a valid email address." />
 * ```
 *
 * Notes:
 * - the visible label is always rendered: it is associated through `htmlFor`,
 *   so no separate accessibility attribute is needed
 * - an `error` sets `aria-invalid`, and both hint and error are wired up with
 *   `aria-describedby`; the error text replaces the hint rather than stacking
 * - focus is visible twice over — the accent hairline plus the global
 *   `:focus-visible` outline from `app/globals.css`
 * - height comes from `--control-height-md` (44px), so fields stay predictable
 * - this is a client component only because `useId` generates a collision-free
 *   id when none is passed. It holds no state and no validation logic — that
 *   belongs to the screen or the form library
 */
export function Input({
  label,
  hint,
  error,
  disabled = false,
  id,
  className,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const description = error ?? hint;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={inputId} className="text-label text-text-secondary">
        {label}
      </label>

      <input
        {...rest}
        id={inputId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptionId}
        className={cn(
          "w-full rounded-md px-3 text-body",
          CONTROL_HEIGHT.md,
          INTERACTION_TRANSITION,
          fieldTone({ error: Boolean(error), disabled }),
          className,
        )}
      />

      {description ? (
        <p
          id={descriptionId}
          className={cn("text-caption", error ? "text-danger" : "text-text-muted")}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
