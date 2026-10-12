/**
 * RootRealm — sync error recovery (TASKS 11.4).
 *
 * ```text
 * a failure → what to do about it
 * ```
 *
 * TASKS 11.4 names five things a sync must support: partial sync, retry, rate
 * limit, failed sync and GitHub outage. They are not five features; they are one
 * decision — *given this failure and what has been recorded so far, what is the
 * next action?* — asked in five situations. This module is that decision, in one
 * total function, so a new failure reason cannot fall through to a default of
 * "give up" or, worse, "retry forever".
 *
 * ## The four actions
 *
 * - `retry_now` — a transient failure that is expected to clear immediately.
 * - `retry_later` — a rate limit: wait the stated delay, then retry.
 * - `stop_partial` — progress was recorded; stop, keep it, and let the next
 *   scheduled sync continue. This is the common outcome for an active developer,
 *   because the activity feed is capped at 300 events (TASKS 4.4).
 * - `stop_failed` — nothing usable came back; stop and surface the failure.
 *
 * ## Why backoff is computed here and not by the caller
 *
 * The attempt number and the reason together determine the wait. Letting each
 * caller invent its own schedule is how one retry loop ends up hammering GitHub
 * while another gives up after one try. The schedule is exponential from a base,
 * capped, and ignores `attempt` for a rate limit — GitHub has stated the delay,
 * and a shorter wait would simply fail again (and risk a secondary limit).
 */
import type { FailureReason } from "../github/failure";

/** What the caller should do next. */
export type RecoveryAction = "retry_now" | "retry_later" | "stop_partial" | "stop_failed";

/** A recovery decision. */
export interface RecoveryDecision {
  readonly action: RecoveryAction;
  /** Milliseconds to wait before retrying, or null when not retrying. */
  readonly waitMs: number | null;
  /** Whether another attempt is allowed at all. */
  readonly retryable: boolean;
  /** Why, in one line, for the job record. */
  readonly reason: string;
}

/** How retrying is bounded. */
export interface RetryPolicy {
  /** The first backoff, in milliseconds. */
  readonly baseDelayMs: number;
  /** The ceiling a backoff may reach. */
  readonly maxDelayMs: number;
  /** How many attempts are made in total, including the first. */
  readonly maxAttempts: number;
}

/** The default policy: three attempts, 1s doubling to a 30s ceiling. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  maxAttempts: 3,
};

/**
 * Decides what to do after a failed attempt.
 *
 * `recordedProgress` is whether this run wrote anything usable. It is what
 * separates `stop_partial` from `stop_failed`, and it is passed in rather than
 * inferred because only the caller knows what it committed.
 */
export function decideRecovery(input: {
  readonly reason: FailureReason;
  /** This attempt's number, 1-based. */
  readonly attempt: number;
  /** Milliseconds until the rate limit resets, when GitHub stated it. */
  readonly retryAfterMs?: number | null;
  /** Whether the run recorded anything before failing. */
  readonly recordedProgress: boolean;
  readonly policy?: RetryPolicy;
}): RecoveryDecision {
  const policy = input.policy ?? DEFAULT_RETRY_POLICY;
  const attemptsLeft = input.attempt < policy.maxAttempts;

  // A rate limit is the one failure where GitHub has stated the wait. Honour it
  // exactly rather than applying our own backoff — retrying sooner is a wasted
  // request, and enough of them escalate to a secondary limit.
  if (input.reason === "rate_limited") {
    const waitMs = input.retryAfterMs ?? policy.baseDelayMs;
    return {
      action: attemptsLeft ? "retry_later" : "stop_partial",
      waitMs: attemptsLeft ? waitMs : null,
      retryable: attemptsLeft,
      reason: attemptsLeft
        ? `Rate limited; retrying in ${waitMs}ms as GitHub asked.`
        : "Rate limited and out of attempts; stopping with what was recorded.",
    };
  }

  // `invalid_username` and `not_found` will not change by asking again. Retrying
  // them is a guaranteed-to-fail loop, so they stop immediately.
  if (input.reason === "invalid_username" || input.reason === "not_found") {
    return {
      action: input.recordedProgress ? "stop_partial" : "stop_failed",
      waitMs: null,
      retryable: false,
      reason:
        input.reason === "not_found"
          ? "No such GitHub account; retrying cannot help."
          : "The username is not valid; retrying cannot help.",
    };
  }

  // `unavailable` (an outage) and `unexpected_response` are transient.
  if (attemptsLeft) {
    const waitMs = Math.min(policy.baseDelayMs * 2 ** (input.attempt - 1), policy.maxDelayMs);
    return {
      action: "retry_now",
      waitMs,
      retryable: true,
      reason:
        input.reason === "unavailable"
          ? `GitHub is unavailable; retrying in ${waitMs}ms.`
          : `Unexpected response; retrying in ${waitMs}ms.`,
    };
  }

  // Out of attempts. Keep whatever was written rather than discarding it: a
  // partial sync that is honest about being partial is better than losing real
  // progress to a transient outage.
  return {
    action: input.recordedProgress ? "stop_partial" : "stop_failed",
    waitMs: null,
    retryable: false,
    reason: "Out of attempts; stopping with what was recorded.",
  };
}

/**
 * The job status a decision ends in.
 *
 * `retry_*` decisions keep the job running; the two `stop_*` decisions end it.
 */
export function statusAfterRecovery(decision: RecoveryDecision): "running" | "partial" | "failed" {
  switch (decision.action) {
    case "retry_now":
    case "retry_later":
      return "running";
    case "stop_partial":
      return "partial";
    case "stop_failed":
      return "failed";
  }
}

/**
 * Runs an operation with the retry policy, returning the last failure.
 *
 * A small helper rather than a general-purpose `retry` library, because the
 * decision above is the interesting part and this only has to honour it. `sleep`
 * is injected so a test does not actually wait.
 */
export async function withRetries<T>(
  operation: (attempt: number) => Promise<
    { ok: true; value: T } | { ok: false; reason: FailureReason; retryAfterMs?: number | null }
  >,
  options: {
    readonly policy?: RetryPolicy;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly recordedProgress?: () => boolean;
  } = {},
): Promise<
  | { ok: true; value: T; attempts: number }
  | { ok: false; reason: FailureReason; attempts: number; partial: boolean }
> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let attempt = 1;

  for (;;) {
    const result = await operation(attempt);

    if (result.ok) {
      return { ok: true, value: result.value, attempts: attempt };
    }

    const decision = decideRecovery({
      reason: result.reason,
      attempt,
      retryAfterMs: result.retryAfterMs ?? null,
      recordedProgress: options.recordedProgress?.() ?? false,
      policy,
    });

    if (!decision.retryable) {
      return {
        ok: false,
        reason: result.reason,
        attempts: attempt,
        partial: decision.action === "stop_partial",
      };
    }

    await sleep(decision.waitMs ?? 0);
    attempt += 1;
  }
}