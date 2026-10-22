"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ComponentProps,
  CSSProperties,
  MouseEvent,
  ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { primaryNavIndex } from "./nav-items";

export type NavigationLinkProps = ComponentProps<typeof Link>;

type NavigationDirection = "forward" | "backward";

type NavigationIndicatorOrientation = "horizontal" | "vertical";

type IndicatorMeasurement = {
  offset: number;
  size: number;
};

export type NavigationIndicatorProps = {
  /** The item index that should own the shared indicator. */
  activeIndex: number | null;
  children: ReactNode;
  className?: string;
  indicatorClassName?: string;
  orientation?: NavigationIndicatorOrientation;
};

/**
 * Wraps a navigation list with one shared active marker. Measuring the active
 * item lets the marker travel between labels of different widths instead of
 * leaving five unrelated underlines behind. The list remains the semantic
 * navigation structure; the marker is decorative and cannot receive input.
 */
export function NavigationIndicator({
  activeIndex,
  children,
  className,
  indicatorClassName,
  orientation = "horizontal",
}: NavigationIndicatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState<IndicatorMeasurement | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || activeIndex === null) {
      setMeasurement(null);
      return;
    }

    const item = container.querySelector<HTMLElement>(
      `[data-navigation-index="${activeIndex}"]`,
    );
    if (!item) {
      setMeasurement(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const nextMeasurement =
      orientation === "horizontal"
        ? {
            offset: itemRect.left - containerRect.left,
            size: itemRect.width,
          }
        : {
            offset: itemRect.top - containerRect.top,
            size: itemRect.height,
          };

    setMeasurement((current) =>
      current?.offset === nextMeasurement.offset && current.size === nextMeasurement.size
        ? current
        : nextMeasurement,
    );
  }, [activeIndex, orientation]);

  useEffect(() => {
    measure();

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resizeObserver?.observe(container);

    const item =
      activeIndex === null
        ? null
        : container.querySelector<HTMLElement>(
            `[data-navigation-index="${activeIndex}"]`,
          );
    if (item) {
      resizeObserver?.observe(item);
    }

    window.addEventListener("resize", measure);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex, measure]);

  const indicatorStyle: CSSProperties =
    orientation === "horizontal"
      ? {
          opacity: measurement ? 1 : 0,
          transform: `translate3d(${measurement?.offset ?? 0}px, 0, 0)`,
          width: `${measurement?.size ?? 0}px`,
        }
      : {
          height: `${measurement?.size ?? 0}px`,
          opacity: measurement ? 1 : 0,
          transform: `translate3d(0, ${measurement?.offset ?? 0}px, 0)`,
        };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-0 z-10 transition-[transform,width,height,opacity] duration-(--motion-medium) ease-entrance motion-reduce:transition-none",
          indicatorClassName,
        )}
        style={indicatorStyle}
      />
      {children}
    </div>
  );
}

function pathnameFromHref(href: NavigationLinkProps["href"]): string | null {
  return typeof href === "string" ? href.split(/[?#]/, 1)[0] : null;
}

function setNavigationDirection(
  currentPathname: string,
  destinationPathname: string,
) {
  const currentIndex = primaryNavIndex(currentPathname);
  const destinationIndex = primaryNavIndex(destinationPathname);
  const direction: NavigationDirection =
    currentIndex !== null &&
    destinationIndex !== null &&
    destinationIndex < currentIndex
      ? "backward"
      : "forward";

  document.documentElement.dataset.motionDirection = direction;
}

/**
 * Primary-navigation link that records the intended slide direction before
 * the App Router swaps the template. Modified clicks keep native link
 * behavior and do not start an animation the browser cannot complete here.
 */
export function NavigationLink({ href, onClick, ...props }: NavigationLinkProps) {
  const pathname = usePathname();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const destinationPathname = pathnameFromHref(href);
    if (!destinationPathname || destinationPathname === pathname) {
      return;
    }

    setNavigationDirection(pathname, destinationPathname);
  }

  return <Link href={href} {...props} onClick={handleClick} />;
}
