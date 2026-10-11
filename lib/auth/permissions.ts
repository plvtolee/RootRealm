/**
 * RootRealm — permission boundaries (TASKS 9.4).
 *
 * ```text
 * three invariants, checked in one place
 * ```
 *
 * TASKS 9.4 names exactly three things to verify:
 *
 * 1. credentials remain server-side
 * 2. only required scopes are requested
 * 3. private data requires explicit authorization
 *
 * A boundary that is only described in prose is a boundary that erodes. This
 * module makes each one a function that can be called and tested, so the claim
 * "credentials remain server-side" is a checked assertion rather than a
 * convention. Phase 19 audits these; Phase 9 establishes them.
 */

import { GITHUB_SCOPES } from "./oauth";

/**
 * The scopes RootRealm is allowed to hold.
 *
 * A set rather than the array itself, so the check is "is every held scope on
 * the list" rather than "does some held scope appear somewhere". Adding a scope
 * anywhere else is caught here.
 */
const REQUIRED_SCOPES: ReadonlySet<string> = new Set(GITHUB_SCOPES);

/** A violated boundary. */
export interface PermissionViolation {
  readonly boundary: "credentials" | "scopes" | "private_data";
  readonly detail: string;
}

/** The result of a boundary check. */
export type PermissionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly violation: PermissionViolation };

/**
 * Boundary 1 — credentials remain server-side.
 *
 * Given a serialized response body, reports any occurrence of a credential. The
 * check is by value, so it catches a token echoed under an unexpected key, which
 * a field-name check ("is there an `accessToken` field?") would miss. It also
 * refuses a body that *is* a credential.
 *
 * The comparison is exact-substring on the token value; a prefix of a token is
 * not a leak worth failing on, and matching prefixes would produce false alarms
 * on short tokens.
 */
export function credentialsStayServerSide(
  body: string,
  credentials: readonly string[],
): PermissionCheck {
  for (const credential of credentials) {
    if (credential.length > 0 && body.includes(credential)) {
      return {
        ok: false,
        violation: {
          boundary: "credentials",
          detail: "A credential appears in the response body.",
        },
      };
    }
  }

  return { ok: true };
}

/**
 * Boundary 2 — only required scopes are requested.
 *
 * The scopes held must be a subset of { REQUIRED_SCOPES }. An empty scope list
 * is allowed: RootRealm can operate anonymously.
 */
export function scopesAreMinimal(held: readonly string[]): PermissionCheck {
  const extra = held.filter((scope) => !REQUIRED_SCOPES.has(scope));
  if (extra.length > 0) {
    return {
      ok: false,
      violation: {
        boundary: "scopes",
        detail: `Unexpected scopes requested: ${[...extra].sort().join(", ")}.`,
      },
    };
  }

  return { ok: true };
}

/**
 * Boundary 3 — private data requires explicit authorization.
 *
 * Private repository data only enters scoring when the developer has explicitly
 * authorized it (PRD §31). This is the single gate: without an affirmative
 * authorization, a request for private data is refused, whatever the caller's
 * session says.
 */
export function privateDataRequiresAuthorization(
  wantsPrivateData: boolean,
  authorization: { readonly authorizedAt: string } | null,
): PermissionCheck {
  if (wantsPrivateData && authorization === null) {
    return {
      ok: false,
      violation: {
        boundary: "private_data",
        detail: "Private data was requested without explicit authorization.",
      },
    };
  }

  return { ok: true };
}

/** Every boundary, checked together, returning all violations. */
export function checkPermissionBoundaries(input: {
  readonly responseBody: string;
  readonly credentials: readonly string[];
  readonly scopesHeld: readonly string[];
  readonly wantsPrivateData: boolean;
  readonly privateAuthorization: { readonly authorizedAt: string } | null;
}): readonly PermissionViolation[] {
  const checks = [
    credentialsStayServerSide(input.responseBody, input.credentials),
    scopesAreMinimal(input.scopesHeld),
    privateDataRequiresAuthorization(input.wantsPrivateData, input.privateAuthorization),
  ];

  return checks.flatMap((check) => (check.ok ? [] : [check.violation]));
}