import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

import { INTERACTION_TRANSITION } from "./control";

/** Surface tone. `surface` is the default card; `secondary` is for nesting. */
export type CardVariant = "surface" | "secondary";

/** Padding steps, from the spacing scale. */
export type CardPadding = "none" | "sm" | "md" | "lg";

/**
 * Depth comes from surface contrast and a hairline border, not from shadow or
 * glow (DESIGN_SYSTEM §9, §10, §23). The card owns background, border and
 * hover; `className` is for layout only.
 */
const CARD_VARIANT: Record<CardVariant, string> = {
  surface: "border border-border bg-surface",
  secondary: "border border-border bg-surface-secondary",
};

const CARD_PADDING: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

/**
 * The whole interaction for a card that is itself the control: the border
 * strengthens and the surface steps up one tone. No lift, no glow, no gradient.
 * The transition itself is the shared interaction transition, so a card and a
 * button move at the same speed.
 */
const CARD_INTERACTIVE = cn(
  INTERACTION_TRANSITION,
  "cursor-pointer hover:border-border-strong hover:bg-surface-secondary",
);

type CardOwnProps<T extends ElementType> = {
  /** Surface tone. Defaults to `surface`. */
  variant?: CardVariant;
  /** Padding. Defaults to `md` (16px) — compact and information-dense. */
  padding?: CardPadding;
  /**
   * Adds the hover affordance for a card that is itself the control, and makes
   * the default element a `<button>` so it stays reachable by keyboard
   * (DESIGN_SYSTEM §31). Pass `as="a"` with an `href` for navigation.
   */
  interactive?: boolean;
  /** Element to render. Defaults to `div` (`button` when `interactive`). */
  as?: T;
  className?: string;
  children?: ReactNode;
};

export type CardProps<T extends ElementType = "div"> = CardOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps<T>>;

/**
 * Restrained surface container — one of the few places RootRealm draws a box.
 *
 * ```tsx
 * <Card>…</Card>
 * <Card padding="lg" variant="secondary">…</Card>
 * <Card as="a" href="/shop" interactive>…</Card>
 * <Card interactive onClick={select}>…</Card>
 * ```
 *
 * Notes:
 * - `interactive` renders a `<button>` by default, so a clickable card is never
 *   an unreachable `<div>`; it also suppresses the implicit submit type, which
 *   would otherwise make a card inside a form submit it
 * - the card holds no product logic: it is a container, not a quest, an
 *   achievement or a cosmetic
 */
export const Card = forwardRef(function Card<T extends ElementType = "div">(
  {
    variant = "surface",
    padding = "md",
    interactive = false,
    as,
    className,
    children,
    ...rest
  }: CardProps<T>,
  ref,
) {
  const Component = (as ?? (interactive ? "button" : "div")) as ElementType;

  // `type` only exists on the button branch; the cast keeps the generic element
  // type usable while still defaulting to a non-submitting button.
  const defaultType =
    Component === "button"
      ? ((rest as { type?: "button" | "submit" | "reset" }).type ?? "button")
      : undefined;

  return (
    <Component
      ref={ref}
      {...(defaultType ? { type: defaultType } : {})}
      {...rest}
      className={cn(
        "rounded-lg text-text-primary",
        CARD_VARIANT[variant],
        CARD_PADDING[padding],
        interactive && CARD_INTERACTIVE,
        className,
      )}
    >
      {children}
    </Component>
  );
});
