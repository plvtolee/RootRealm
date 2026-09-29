import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cn } from "@/lib/cn";

type ContainerOwnProps<T extends ElementType> = {
  /** Element to render. Defaults to `div`. */
  as?: T;
  className?: string;
  children?: ReactNode;
};

export type ContainerProps<T extends ElementType = "div"> = ContainerOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof ContainerOwnProps<T>>;

/**
 * The RootRealm content container (Task 1.4).
 *
 * ```tsx
 * <Container>…</Container>
 * <Container as="section" aria-labelledby="skills-heading">…</Container>
 * ```
 *
 * Notes:
 * - width and side padding come from the shell tokens in
 *   `styles/tokens/layout.css` (`--layout-content-max`, `--layout-padding-x`),
 *   which step at 768 / 1024 / 1280 / 1440+. A screen never restates a max
 *   width or a horizontal padding value; if a screen needs a different region,
 *   it gets one by composing another `Container`, not by overriding this one.
 * - it is horizontal only. Vertical rhythm belongs to the screen, so a
 *   full-bleed block can still sit between two contained blocks.
 * - `className` is for layout of the element itself (flex, gap). Do not use it
 *   to restate the width or the padding — `cn` cannot resolve conflicts
 *   (lib/cn.ts).
 */
export function Container<T extends ElementType = "div">({
  as,
  className,
  children,
  ...rest
}: ContainerProps<T>) {
  const Component = (as ?? "div") as ElementType;

  return (
    <Component
      {...rest}
      className={cn(
        "mx-auto w-full max-w-(--layout-content-max) px-(--layout-padding-x)",
        className,
      )}
    >
      {children}
    </Component>
  );
}
