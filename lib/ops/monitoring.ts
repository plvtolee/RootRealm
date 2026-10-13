/**
 * RootRealm — monitoring emitters (TASKS 21.3).
 *
 * ```text
 * the four things production must be able to watch, each one line of JSON
 * ```
 *
 * TASKS 21.3 names four surfaces: structured error logs, synchronization,
 * API rate limits and transaction failures. They are the same operation over
 * different events, so they are four functions over the one logger
 * (`lib/ops/logger.ts`) rather than four `console` calls that each invent a
 * format. The value of keeping them here is the same value the rest of the
 * project keeps finding: the *shape* of a log line is decided once, so an alert
 * written against `event: "sync.failed"` keeps working when a caller changes.
 *
 * ## Why these are functions and not inline calls at each site
 *
 * A call site that builds its own fields gets the field names slightly wrong, or
 * omits the counter someone will want at 3am. The functions take the domain
 * object — a `SyncJob`, a `RateLimitState`, a `PurchaseOutcome` — and derive the
 * line from it, so every sync failure is described the same way and a new field
 * on the job appears in the log without a second edit.
 *
 * ## Why the logger is passed in
 *
 * No module-level logger is captured here. A caller supplies one, so a test can
 * capture output without touching the real stdout, and a request can carry a
 * logger already bound to its own service name. {@link serviceLogger} provides
 * the convenience for the common case without making it the only option.
 */
import type { PurchaseOutcome } from "../currency/purchase";
import type { FailureReason } from "../github/failure";
import type { RateLimitState } from "../github/rate-limit";
import type { RecoveryDecision } from "../sync/recovery";
import type { SyncJob } from "../sync/job";

import { createLogger, type LogFields, type Logger } from "./logger";

/* -------------------------------------------------------------------------- */
/* Logger access                                                               */
/* -------------------------------------------------------------------------- */

const loggers = new Map<string, Logger>();

/**
 * The logger for a service, reused across calls.
 *
 * Cached so that a request-scoped service does not rebuild the redaction list —
 * which reads the environment — on every line. The cache is keyed by service
 * name and never evicted: the set of service names is small and fixed.
 */
export function serviceLogger(service: string): Logger {
  const existing = loggers.get(service);
  if (existing !== undefined) return existing;

  const logger = createLogger({ service });
  loggers.set(service, logger);
  return logger;
}

/* -------------------------------------------------------------------------- */
/* Synchronization (TASKS 11.1–11.4)                                           */
/* -------------------------------------------------------------------------- */

/** Milliseconds between two ISO timestamps, or null when either is unusable. */
function durationMs(startedAt: string, finishedAt: string | null): number | null {
  if (finishedAt === null) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, end - start);
}

/**
 * The fields of a sync job, for a log line or a test.
 *
 * Kept separate from {@link logSyncJob} so the shape can be asserted without a
 * sink, and so a future dashboard can render the same numbers the log carries.
 */
export function syncJobFields(job: SyncJob): LogFields {
  return {
    jobId: job.id,
    developer: job.developerLogin,
    status: job.status,
    phasesCompleted: job.completedPhases.length,
    failureReason: job.failureReason,
    durationMs: durationMs(job.startedAt, job.finishedAt),
    eventsObserved: job.counters.eventsObserved,
    eventsNew: job.counters.eventsNew,
    eventsDuplicate: job.counters.eventsDuplicate,
    xpAwarded: job.counters.xpAwarded,
    transactionsWritten: job.counters.transactionsWritten,
    achievementsUnlocked: job.counters.achievementsUnlocked,
  };
}

/**
 * How a job status maps to a level.
 *
 * `partial` is a warning, not an error, and that is deliberate: the activity feed
 * is capped at 300 events (TASKS 4.4), so a busy developer's sync is always
 * partial. An alert that fires on every partial sync is an alert an operator
 * learns to ignore, which is worse than having none.
 */
const SYNC_LEVEL: Record<SyncJob["status"], "debug" | "info" | "warn" | "error"> = {
  running: "debug",
  succeeded: "info",
  partial: "warn",
  failed: "error",
};

/** Emits one line describing a synchronization job. */
export function logSyncJob(job: SyncJob, logger: Logger): void {
  logger.log(SYNC_LEVEL[job.status], `sync.${job.status}`, syncJobFields(job));
}

/**
 * Emits a synchronization recovery decision.
 *
 * The decision is not the job: a job can be retried several times before it ends,
 * and each decision is the reason a retry happened. Emitting both is what makes
 * "the sync gave up" answerable with "after three retries, because of a rate
 * limit".
 */
export function logRecoveryDecision(
  decision: RecoveryDecision,
  context: { readonly developerLogin: string },
  logger: Logger,
): void {
  logger.log(
    decision.action.startsWith("retry") ? "info" : "warn",
    "sync.recovery",
    {
      developer: context.developerLogin,
      action: decision.action,
      retryable: decision.retryable,
      waitMs: decision.waitMs,
      reason: decision.reason,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* API rate limits (TASKS 4.1, 4.7)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Whether a rate-limit snapshot is worth a warning.
 *
 * An exhausted budget, or a stated `retry-after`, is the state a human needs to
 * know about; a healthy remaining count is only interesting when diagnosing, so
 * it is emitted at `debug` and stays out of a default `info` stream.
 */
export function rateLimitIsConcerning(state: RateLimitState): boolean {
  return state.remaining === 0 || (state.retryAfterMs !== null && state.retryAfterMs > 0);
}

/** Emits the rate-limit budget after a GitHub operation. */
export function logRateLimit(
  state: RateLimitState,
  context: { readonly operation: string; readonly login?: string | null },
  logger: Logger,
): void {
  const concerning = rateLimitIsConcerning(state);

  logger.log(concerning ? "warn" : "debug", "github.rate_limit", {
    operation: context.operation,
    login: context.login ?? null,
    limit: state.limit,
    remaining: state.remaining,
    // Epoch milliseconds, not a formatted time: a consumer comparing against its
    // own clock needs the number, and a human reading a log can be told the unit.
    resetsAt: state.resetsAt,
    retryAfterMs: state.retryAfterMs,
    exhausted: state.remaining === 0,
  });
}

/* -------------------------------------------------------------------------- */
/* Ingestion failures (TASKS 4.2)                                              */
/* -------------------------------------------------------------------------- */

/**
 * The ingestion reasons that are someone misusing an input rather than an
 * incident. `not_found` and `invalid_username` are normal answers and are logged
 * at `info`; the rest mean GitHub is misbehaving or is rate-limiting us.
 */
const EXPECTED_FAILURES: ReadonlySet<FailureReason> = new Set(["not_found", "invalid_username"]);

/** Emits a GitHub lookup failure. */
export function logIngestionFailure(
  reason: FailureReason,
  context: { readonly operation: string; readonly login: string | null },
  logger: Logger,
): void {
  logger.log(EXPECTED_FAILURES.has(reason) ? "info" : "warn", "github.ingestion_failed", {
    operation: context.operation,
    login: context.login,
    reason,
  });
}

/* -------------------------------------------------------------------------- */
/* Transaction failures (TASKS 14.4, 15.3)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Emits a CodeCoin transaction outcome.
 *
 * Every refusal reason is a legitimate answer to a user — "you cannot afford
 * this" is not an error — so refusals are `info`. The one exception is
 * `already_charged`, which the purchase flow documents as a state that *should
 * be unreachable* (a charge persisted without its grant). That is a real
 * inconsistency an operator has to reconcile, so it is the only refusal logged at
 * `error`, which is what gives the reason a reason to exist in a log.
 */
export function logTransaction(
  outcome: PurchaseOutcome,
  context: { readonly userId: string; readonly itemId: string },
  logger: Logger,
): void {
  if (outcome.ok) {
    logger.info("shop.transaction_succeeded", {
      userId: context.userId,
      itemId: outcome.itemId,
      cost: outcome.cost,
      balance: outcome.balance,
    });
    return;
  }

  logger.log(outcome.refusal === "already_charged" ? "error" : "info", "shop.transaction_failed", {
    userId: context.userId,
    itemId: context.itemId,
    refusal: outcome.refusal,
    cost: outcome.cost,
    balance: outcome.balance,
  });
}

/* -------------------------------------------------------------------------- */
/* Auth (TASKS 9.1–9.3)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Emits an account claim.
 *
 * The token fingerprint is a hash prefix, never the token: TASKS 19.1 forbids a
 * credential leaving the process, and a fingerprint is the correlation handle
 * that lets a claim be traced without being one.
 */
export function logAccountClaim(
  claim: {
    readonly login: string;
    readonly githubId: number;
    readonly existing: boolean;
    readonly tokenFingerprint: string;
  },
  logger: Logger,
): void {
  logger.info("auth.account_claimed", {
    login: claim.login,
    githubId: claim.githubId,
    existing: claim.existing,
    // Deliberately not `tokenFingerprint`: a field name containing "token" is
    // redacted by the logger's name check, and a fingerprint is not a token —
    // it is the correlation handle that exists precisely so the token need not
    // be logged. Naming it for what it is keeps it visible.
    fingerprint: claim.tokenFingerprint,
  });
}