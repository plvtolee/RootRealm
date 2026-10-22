"use client";

import {
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
  type AnimationEvent,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

/** The two shared entrance treatments; neither knows about product concepts. */
export type RevealVariant = "content" | "page";

export type RevealProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  children: ReactNode;
  /** Defaults to the quieter content reveal. */
  variant?: RevealVariant;
};

export type MotionDirection = "forward" | "backward";

type MotionDirectionRoot = {
  dataset: DOMStringMap;
};

type MotionDirectionElement = {
  style: Pick<CSSStyleDeclaration, "setProperty">;
};

/**
 * Transfers the click-time direction to the page that is about to animate.
 *
 * NavigationLink writes the short-lived document attribute before the App
 * Router swaps the template. Consuming it here makes the direction belong to
 * this page instance instead of remaining global while older pages unmount.
 * That is what keeps a fast second click from inheriting or clearing stale
 * direction state.
 */
export function consumeNavigationDirection(
  root: MotionDirectionRoot,
  element: MotionDirectionElement,
): MotionDirection {
  const direction: MotionDirection =
    root.dataset.motionDirection === "backward" ? "backward" : "forward";

  element.style.setProperty(
    "--motion-page-direction",
    direction === "backward" ? "-1" : "1",
  );
  delete root.dataset.motionDirection;

  return direction;
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A small client boundary for shared content entrances.
 *
 * The element is visible while it hydrates, so a delayed client bundle cannot
 * hide server-rendered content. Once it enters the viewport, the CSS token
 * layer applies the appropriate reveal. `app/template.tsx` uses the `page`
 * variant because templates remount on navigation.
 */
export function Reveal({
  children,
  className,
  variant = "content",
  onAnimationEnd,
  ...props
}: RevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  // A page is already in the viewport when the template mounts. Starting it
  // visible avoids a pending -> visible paint that would briefly show the
  // destination and then hide it at the start of the animation.
  const [isVisible, setIsVisible] = useState(variant === "page");

  useIsomorphicLayoutEffect(() => {
    const element = elementRef.current;

    if (!element) {
      return;
    }

    element.dataset.motionHydrated = "true";

    if (variant !== "page") {
      return () => {
        delete element.dataset.motionHydrated;
      };
    }

    consumeNavigationDirection(document.documentElement, element);

    return () => {
      element.style.removeProperty("--motion-page-direction");
      delete element.dataset.motionHydrated;
    };
  }, [variant]);

  useEffect(() => {
    const element = elementRef.current;

    if (!element || variant === "page") {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) {
        return;
      }

      setIsVisible(true);
      observer.disconnect();
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [variant]);

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    onAnimationEnd?.(event);
  }

  return (
    <div
      {...props}
      ref={elementRef}
      data-motion-reveal={isVisible ? "visible" : "pending"}
      className={cn(
        variant === "page" ? "motion-page-slide" : "motion-reveal",
        className,
      )}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
}
