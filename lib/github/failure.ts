/**
 * RootRealm — the ingestion failure contract (TASKS 4.2, extended by 4.3).
 *
 * Every ingestion service — profile, repositories, activity — reports the same
 * five controlled reasons, so a screen that renders a lookup result can handle
 * "no such developer", "rate limited" and "GitHub is down" without knowing which
 * endpoint produced the failure.
 *
 * Two rules make this worth extracting:
 *
 * - the mapping from the transport taxonomy (`errors.ts`) to these reasons is
 *   total and lives here once, so a new `GitHubErrorKind` cannot be reported to
 *   users as a generic outage;
 * - {@link statusForReason} is the only place a reason becomes an HTTP status,
 *   so the profile route and the repository route cannot disagree about whether
 *   an unknown account is a 404 and an outage is a 503.
 */
import { isGitHubError, type GitHubErrorKind } from "./errors";
import type { RateLimitState } from "./rate-limit";

/**
 * The reasons a UI must be able to distinguish. Each implies a different message
 * and a different next action, which is why they are not collapsed into one
 * `error` case.
 */
export type FailureReason =
  /** Nothing was requested — the input itself is malformed. */
  | "invalid_username"
  /** No such public account. */
  | "not_found"
  /** GitHub's request budget is spent. */
  | "rate_limited"
  /** GitHub failed, timed out, or rejected our credentials. */
  | "unavailable"
  /** The payload did not match the documented contract. */
  | "unexpected_response";

/** User-safe wording. Never contains a URL, a token or a stack trace. */
const FAILURE_MESSAGE: Record<FailureReason, string> = {
  invalid_username: "That is not a valid GitHub username.",
  not_found: "No public GitHub account exists with that username.",
  rate_limited: "GitHub's rate limit has been reached. Try again shortly.",
  unavailable: "GitHub is unavailable right now. Try again shortly.",
  unexpected_response: "GitHub returned an unexpected response. Try again shortly.",
};

/**
 * HTTP status per reason.
 *
 * `invalid_username` is a 400 because the caller sent something malformed;
 * `not_found` is a 404 because the resource genuinely does not exist; a rate
 * limit is a 429; and the rest are 502/503 because the failure is upstream, not
 * in the request. The distinction is load-bearing: TASK 8.2 must show "no such
 * developer" for a 404 and "try again" for a 503, and neither may be rendered as
 * an empty profile.
 */
const STATUS_BY_REASON: Record<FailureReason, number> = {
  invalid_username: 400,
  not_found: 404,
  rate_limited: 429,
  unavailable: 503,
  unexpected_response: 502,
};

export function statusForReason(reason: FailureReason): number {
  return STATUS_BY_REASON[reason];
}

export interface IngestionFailure {
  reason: FailureReason;
  /** Safe to render. */
  message: string;
  /** GitHub's own wording, for server-side logs only. */
  detail: string | null;
  /** Milliseconds until the budget resets, when GitHub said so. */
  retryAfterMs: number | null;
}

/**
 * Collapses the transport taxonomy into the product-facing reasons.
 *
 * `forbidden` and `unauthorized` map to `unavailable` rather than to a reason of
 * their own: from the user's side an exhausted or mis-scoped credential is an
 * upstream problem they cannot act on, and surfacing "forbidden" would imply
 * the account is private when it may simply be our token.
 */
function reasonFor(kind: GitHubErrorKind): FailureReason {
  switch (kind) {
    case "invalid_username":
      return "invalid_username";
    case "not_found":
      return "not_found";
    case "rate_limited":
      return "rate_limited";
    case "server_error":
    case "network_error":
    case "timeout":
    case "forbidden":
    case "unauthorized":
      return "unavailable";
    default:
      return "unexpected_response";
  }
}

/**
 * Normalises a caught value into a controlled failure.
 *
 * Returns `null` when the value is not a `GitHubError`, which is how services
 * keep a programming error visible instead of reporting it as an outage: they
 * re-throw whatever this returns `null` for.
 */
export function toFailure(
  error: unknown,
  rateLimit: RateLimitState,
): IngestionFailure | null {
  if (!isGitHubError(error)) return null;

  const reason = reasonFor(error.kind);

  return {
    reason,
    message: FAILURE_MESSAGE[reason],
    detail: error.message,
    retryAfterMs: error.retryAfterMs ?? rateLimit.retryAfterMs,
  };
}