/** The post-authentication destination used when no destination was supplied. */
export const DEFAULT_AUTH_NEXT = "/home";

/**
 * Keeps a post-authentication destination on this origin.
 *
 * Only path-and-query values beginning with one slash are accepted. In
 * particular, protocol-relative URLs (`//host`) and backslash variants are
 * rejected so a value from a query string can never become an open redirect.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (value === null || value === undefined) return DEFAULT_AUTH_NEXT;

  const candidate = value.trim();
  if (
    candidate.length === 0 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return DEFAULT_AUTH_NEXT;
  }

  try {
    const parsed = new URL(candidate, "https://rootrealm.invalid");
    if (parsed.origin !== "https://rootrealm.invalid") return DEFAULT_AUTH_NEXT;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return DEFAULT_AUTH_NEXT;
  }
}

/** Builds the login URL with a validated internal destination. */
export function loginPath(next: string | null | undefined): string {
  return `/login?next=${encodeURIComponent(safeNextPath(next))}`;
}
