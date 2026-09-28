import type { ComponentPropsWithoutRef, ElementType } from "react";

import { cn } from "@/lib/cn";

/**
 * The six RootRealm typography roles (docs/DESIGN_SYSTEM.md §5).
 *
 * | role         | use                                                    |
 * | ------------ | ------------------------------------------------------ |
 * | `display`    | large section titles and identity moments              |
 * | `heading`    | screen and section titles                              |
 * | `subheading` | supporting section hierarchy                           |
 * | `body`       | descriptions and normal content                        |
 * | `caption`    | metadata, timestamps and supporting information         |
 * | `label`      | buttons, filters, tabs and status indicators            |
 */
export type TextVariant =
  | "display"
  | "heading"
  | "subheading"
  | "body"
  | "caption"
  | "label";

/**
 * Size, weight, tracking and leading come from one token-backed utility per
 * role. The values (and their responsive steps) live in
 * `styles/tokens/typography.css`; nothing is redefined here.
 */
const VARIANT_CLASS: Record<TextVariant, string> = {
  display: "text-display",
  heading: "text-heading",
  subheading: "text-subheading",
  body: "text-body",
  caption: "text-caption",
  label: "text-label",
};

/**
 * Default element per role, chosen for semantics rather than looks
 * (docs/DESIGN_SYSTEM.md §31). Override with `as` whenever the document
 * outline or the surrounding markup requires something else — for example
 * `as="h2"` for a section that is not the page title.
 */
const VARIANT_ELEMENT: Record<TextVariant, ElementType> = {
  display: "h1",
  heading: "h2",
  subheading: "h3",
  body: "p",
  caption: "span",
  label: "span",
};

type TextOwnProps<T extends ElementType> = {
  /** Typography role. Defaults to `body`. */
  variant?: TextVariant;
  /** Element to render. Defaults to the role's semantic element. */
  as?: T;
  className?: string;
};

export type TextProps<T extends ElementType = "p"> = TextOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof TextOwnProps<T>>;

/**
 * Renders one of the six RootRealm typography roles.
 *
 * ```tsx
 * <Text variant="display">plvtolee</Text>                    // <h1>
 * <Text variant="heading" as="h2">Recent Achievements</Text> // <h2>
 * <Text variant="caption" className="text-text-muted">12 Mar 2026</Text>
 * ```
 *
 * Notes:
 * - colour is never set here. Text inherits the inherited colour (usually
 *   `--color-text-primary` from `body`); pass a semantic text colour utility
 *   such as `text-text-secondary` or `text-text-muted` when a role is quieter
 *   than the default, as captions and labels usually are.
 * - only one typography role may be applied to an element. Do not override it
 *   with another `text-*` size utility; pick the right `variant` instead.
 * - the component is presentational and hook-free, so it works in server and
 *   client components alike.
 */
export function Text<T extends ElementType = "p">({
  variant = "body",
  as,
  className,
  ...rest
}: TextProps<T>) {
  const Component = (as ?? VARIANT_ELEMENT[variant]) as ElementType;

  return <Component className={cn(VARIANT_CLASS[variant], className)} {...rest} />;
}
