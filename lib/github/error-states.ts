/**
 * RootRealm — GitHub error and notice states (TASKS 4.8).
 *
 * ```text
 * FailureReason (+ observed counts) → what to tell the user
 * ```
 *
 * The failure taxonomy from TASKS 4.2 maps a GitHub response to one of five
 * reasons and an HTTP status. This module is the other half: what a *person*
 * should be told, how urgently, and what they can do about it. It exists so that
 * no screen invents its own copy — a reason that renders as "GitHub is
 * unavailable" in one place and "try again" in another is a bug waiting for a
 * support ticket.
 *
 * ## Why two of these are not errors
 *
 * TASKS 4.8 lists seven states, and only five map onto failure reasons:
 *
 * - **Empty activity** is not an error. An idle developer is not a failed
 *   lookup, and GitHub has not failed either. Rendering it as an error would
 *   tell a legitimate account something is broken.
 * - **Partial pagination** is not an error either — it is a *complete walk that
 *   stopped*, which is the expected outcome for anyone with more repositories
 *   than one page can hold, or more activity than GitHub will serve. Treating it
 *   as a failure would make almost every active developer look broken.
 *
 * Both are {@link Notice} instead: a statement about the run's bounds the user
 * may care about, with no implication that anything failed.
 *
 * ## The one thing this module fixes that was a real defect
 *
 * `not_found` previously rendered as *"No public GitHub account exists with that
 * username."* Verified against the live API (2026-10-10): a deleted account, a
 * renamed account and a username that never existed all return an identical 404.
 * GitHub gives us nothing to tell them apart with.
 *
 * So the old wording asserted a fact we cannot observe. For a developer who
 * renamed their account or deleted it, it is simply false — and the useful
 * diagnosis is the opposite: the account probably *did* exist and is gone. The
 * copy is corrected to what the evidence actually supports, and the next action
 * points at the likely cause rather than at the user's typing.
 */
import type { FailureReason } from "./failure";
import type { CoverageReport } from "../coverage";

/**
 * How much of the product is unavailable.
 *
 * `blocking` means no profile at all; `degraded` means the profile or a section
 * could not be produced; `warning` means the run succeeded but its bounds are
 * worth stating.
 */
export type ErrorSeverity = "blocking" | "degraded" | "warning";

export interface ErrorState {
  reason: FailureReason;
  severity: ErrorSeverity;
  /** Short heading. */
  title: string;
  /** What happened, safe to render verbatim. */
  message: string;
  /** What the person can do, or null when there is genuinely nothing. */
  nextAction: string | null;
  /** Whether an identical retry could plausibly succeed. */
  retryable: boolean;
  /** GitHub's own `Retry-After` / reset, in milliseconds, when supplied. */
  retryAfterMs: number | null;
}

interface ReasonCopy {
  severity: ErrorSeverity;
  title: string;
  message: string;
  nextAction: string | null;
  retryable: boolean;
}

const COPY: Record<FailureReason, ReasonCopy> = {
  invalid_username: {
    severity: "blocking",
    title: "That is not a valid username",
    message:
      "GitHub usernames may only contain letters, numbers and single hyphens, and cannot begin or end with a hyphen.",
    // The one state the user can actually fix themselves.
    nextAction: "Check the spelling and try again.",
    retryable: false,
  },
  not_found: {
    severity: "blocking",
    title: "No public profile found",
    // Deliberately not "no such account exists": deleted and renamed accounts
    // return the same 404 as a username that never existed, so the stronger
    // claim cannot be made. See the module header.
    message:
      "GitHub did not find a public account under that name. It may have been renamed or deleted, or the account may be private.",
    nextAction:
      "Try the developer's current username. If they renamed their account, their profile URL will still work.",
    retryable: false,
  },
  rate_limited: {
    severity: "blocking",
    title: "GitHub's rate limit is spent",
    message:
      "GitHub limits how often an unauthenticated application may ask about public accounts, and this budget is exhausted.",
    // The one state where the honest advice is to wait; the reset time is
    // attached separately.
    nextAction: "Wait for the budget to reset, then try again.",
    retryable: true,
  },
  unavailable: {
    severity: "blocking",
    title: "GitHub is unavailable",
    message:
      "GitHub did not respond in a way we could use. This is usually temporary.",
    nextAction: "Try again in a moment.",
    retryable: true,
  },
  unexpected_response: {
    severity: "blocking",
    title: "GitHub returned something unexpected",
    message:
      "GitHub answered, but the reply did not match the shape our client expects.",
    // Not retryable: an identical request would return the identical reply. This
    // is the one failure where waiting helps none.
    nextAction: "This is worth reporting — the response contract may have changed.",
    retryable: false,
  },
};

/**
 * Builds the user-facing state for a failure.
 *
 * @param reason        The controlled reason from the failure taxonomy.
 * @param retryAfterMs  GitHub's own reset delay, when it supplied one.
 * @param severityOverride
 *   Raises or lowers severity when the failure did not cost the whole lookup.
 *   A repository lookup failing while the profile resolved is `degraded`, not
 *   `blocking` — the profile is the thing the user came for.
 */
export function errorStateFor(
  reason: FailureReason,
  retryAfterMs: number | null = null,
  severityOverride?: ErrorSeverity,
): ErrorState {
  const copy = COPY[reason];

  return {
    reason,
    severity: severityOverride ?? copy.severity,
    title: copy.title,
    message: copy.message,
    nextAction: copy.nextAction,
    retryable: copy.retryable,
    retryAfterMs,
  };
}

/** A non-failure statement about the bounds of a successful run. */
export type NoticeKind =
  /** The account has no recent public activity. */
  | "empty_activity"
  /** A walk stopped before exhausting its feed. */
  | "partial_pagination"
  /** GitHub reported more repositories than the walk observed. */
  | "repository_shortfall"
  /** The developer's own public repositories were not all confirmed. */
  | "repository_unconfirmed";

export interface Notice {
  kind: NoticeKind;
  severity: Extract<ErrorSeverity, "warning">;
  title: string;
  message: string;
  /** Supporting number, when the notice is about a count. */
  count: number | null;
}

/**
 * Derives the notices a run's coverage warrants.
 *
 * Pure over the coverage report, so the same run always yields the same
 * notices. A `complete` run yields none, which is the correct answer rather than
 * the absence of one: there is nothing to caveat.
 */
export function noticesFor(coverage: CoverageReport): Notice[] {
  const notices: Notice[] = [];

  // Empty activity first: it is the most common quiet state and the one most
  // likely to be mistaken for a failure.
  if (coverage.activity.observed === 0) {
    notices.push({
      kind: "empty_activity",
      severity: "warning",
      title: "No recent public activity",
      message:
        "This account has no public activity in the period GitHub still exposes. That is not an error — it simply means there is nothing to score.",
      count: 0,
    });
  }

  if (coverage.repositories.shortfall !== null) {
    notices.push({
      kind: "repository_shortfall",
      severity: "warning",
      title: "Repository list is incomplete",
      message: `GitHub reports ${coverage.repositories.declared} public repositories, but ${coverage.repositories.observed} were observed. Repository-based evidence is therefore not exhaustive.`,
      count: coverage.repositories.shortfall,
    });
  }

  if (coverage.activity.atCeiling) {
    notices.push({
      kind: "partial_pagination",
      severity: "warning",
      title: "Activity feed reached its ceiling",
      message:
        "GitHub serves at most 300 events per developer. Older activity was not observed, so the counts below describe only what GitHub still exposes.",
      count: coverage.activity.observed,
    });
  } else if (coverage.activity.pagination.stoppedBy === "page_cap") {
    notices.push({
      kind: "partial_pagination",
      severity: "warning",
      title: "Activity walk stopped early",
      message:
        "The activity feed stopped before it was exhausted, so some events were not observed.",
      count: coverage.activity.observed,
    });
  }

  if (coverage.repositories.pagination.stoppedBy !== "exhausted") {
    notices.push({
      kind: "partial_pagination",
      severity: "warning",
      title: "Repository walk stopped early",
      message:
        "The repository list stopped before it was exhausted, so some repositories were not observed.",
      count: coverage.repositories.observed,
    });
  }

  return notices;
}

/**
 * Formats a retry delay in a way that stays readable at both ends of its range.
 *
 * `Retry-After` arrives in milliseconds and is often a round minute, so a naive
 * seconds format reads as "retry in 1s" for 1000ms and "retry in 60s" for a
 * minute — which invites a retry a full minute early.
 */
export function formatRetryDelay(retryAfterMs: number | null): string | null {
  if (retryAfterMs === null || retryAfterMs <= 0) return null;

  const seconds = Math.ceil(retryAfterMs / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
