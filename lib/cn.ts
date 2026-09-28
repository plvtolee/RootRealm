/**
 * Class name composition for RootRealm UI primitives.
 *
 * Deliberately dependency-free: the project does not use `clsx`,
 * `classnames` or `tailwind-merge`. Because there is no conflict resolution,
 * a caller-supplied class only wins over a primitive's own class when the two
 * do not set the same CSS property (see the styling rules in AGENTS.md).
 */

/** Values accepted by {@link cn}. Falsy entries are skipped. */
export type ClassValue = string | false | null | undefined;

/**
 * Joins class names, dropping falsy entries.
 *
 * @example
 * cn("text-body", isMuted && "text-text-muted", className)
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
