import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

/** Sizes from `styles/tokens/component.css`. `md` (44px) is the default. */
export type AvatarSize = "sm" | "md" | "lg" | "xl";

const AVATAR_SIZE: Record<AvatarSize, string> = {
  sm: "size-(--avatar-size-sm)",
  md: "size-(--avatar-size-md)",
  lg: "size-(--avatar-size-lg)",
  xl: "size-(--avatar-size-xl)",
};

/**
 * Initials are the only text an avatar ever shows, and they must stay readable
 * at every size, so the two large sizes step up one typography role
 * (DESIGN_SYSTEM §5) instead of scaling a single size.
 */
const AVATAR_INITIALS: Record<AvatarSize, string> = {
  sm: "text-label",
  md: "text-label",
  lg: "text-subheading",
  xl: "text-subheading",
};

/** Everything up to two words, first letter each, upper case. */
function deriveInitials(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return initials.length > 0 ? initials : undefined;
}

type AvatarWithImage = {
  /** Image source — a GitHub avatar or a user upload. */
  src: string;
  /** Alternative text. Required whenever there is an image (§31). */
  alt: string;
};

type AvatarWithoutImage = {
  /** No image: the avatar renders its initials fallback instead. */
  src?: undefined;
  alt?: undefined;
};

export type AvatarProps = {
  /** Size. Defaults to `md`. */
  size?: AvatarSize;
  /** Full name: the accessible name, and the source of the fallback initials. */
  name?: string;
  /** Explicit initials, when they should not be derived from `name`. */
  initials?: string;
  className?: string;
} & (AvatarWithImage | AvatarWithoutImage) &
  Omit<ComponentPropsWithoutRef<"span">, "children" | "className">;

/**
 * Circular identity image with an initials fallback.
 *
 * ```tsx
 * <Avatar src={user.avatarUrl} alt={user.name} size="lg" />
 * <Avatar name="plvtolee" initials="PL" />
 * ```
 *
 * Notes:
 * - `alt` is required by the type whenever `src` is given, and there is no way
 *   to render an image without it
 * - without an image the fallback is either the given initials or the ones
 *   derived from `name`; with neither, it is an empty neutral circle rather
 *   than an invented placeholder graphic
 * - it is a plain `<img>`, not the Next.js image pipeline: avatar sources are
 *   user- or GitHub-provided remote URLs, and loading them is a later concern
 *   (see the note in the component). No image config is changed in this task
 * - decorative frames, glows and rarity treatments are explicitly out of scope
 *   here (DESIGN_SYSTEM §13, §14)
 */
export function Avatar({
  size = "md",
  name,
  initials,
  className,
  src,
  alt,
  ...rest
}: AvatarProps) {
  const fallbackInitials = initials ?? deriveInitials(name);

  return (
    <span
      {...rest}
      role={!src && name ? "img" : undefined}
      aria-label={!src && name ? name : undefined}
      aria-hidden={!src && !name ? true : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill border border-border bg-surface-secondary",
        AVATAR_SIZE[size],
        className,
      )}
    >
      {src ? (
        // Avatar URLs are remote and user-provided; the Next.js image optimizer
        // needs image config that is out of scope for the primitives task.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className={cn(AVATAR_INITIALS[size], "text-text-secondary")}
        >
          {fallbackInitials}
        </span>
      )}
    </span>
  );
}
