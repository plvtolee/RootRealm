import { describe, expect, it } from "vitest";

import { startSyncJob, completePhase, succeedSyncJob, failSyncJob, markPartial, withCounters, type SyncJob } from "../sync/job";
import type { PurchaseOutcome } from "../currency/purchase";
import type { RateLimitState } from "../github/rate-limit";
import { decideRecovery } from "../sync/recovery";

import { createLogger } from "./logger";
import {
  logAccountClaim,
  logIngestionFailure,
  logRateLimit,
  logRecoveryDecision,
  logSyncJob,
  logTransaction,
  rateLimitIsConcerning,
  serviceLogger,
  syncJobFields,
} from "./monitoring";

/**
 * TASKS 21.3 names four monitoring surfaces. These tests hold each emitter to the
 * decision that makes it useful: the right level for the outcome, and the fields
 * an operator would need — so a "sync failed" line actually says why and how
 * much, rather than saying only that something went wrong.
 */

function collector(): { logger: ReturnType<typeof createLogger>; lines: string[] } {
  const lines: string[] = [];
  const logger = createLogger({
    service: "test",
    level: "debug",
    secrets: [],
    now: () => "2026-10-13T00:00:00.000Z",
    sink: (line) => lines.push(line),
  });
  return { logger, lines };
}

function last(lines: string[]): Record<string, unknown> {
  expect(lines.length).toBeGreaterThan(0);
  return JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
}

/** A finished sync job, for the job and recovery emitters. */
function finishedJob(status: "succeeded" | "partial" | "failed"): SyncJob {
  const base = startSyncJob({ id: "job-1", developerLogin: "octocat", startedAt: "2026-10-13T00:00:00.000Z" });
  const counted = withCounters(base, {
    eventsObserved: 10,
    eventsNew: 4,
    eventsDuplicate: 6,
    xpAwarded: 120,
    transactionsWritten: 4,
    achievementsUnlocked: 1,
  });

  if (status === "succeeded") {
    let job = counted;
    for (const phase of ["fetch", "normalize", "score", "progression"] as const) {
      job = completePhase(job, phase);
    }
    return succeedSyncJob(job, "2026-10-13T00:00:02.500Z");
  }

  return status === "partial"
    ? markPartial(counted, "ceiling_reached", "2026-10-13T00:00:02.500Z")
    : failSyncJob(counted, "unavailable", "2026-10-13T00:00:02.500Z");
}

describe("logSyncJob", () => {
  it("records a success with its counters and duration at info", () => {
    const { logger, lines } = collector();
    logSyncJob(finishedJob("succeeded"), logger);

    const line = last(lines);
    expect(line.event).toBe("sync.succeeded");
    expect(line.level).toBe("info");
    expect(line.jobId).toBe("job-1");
    expect(line.developer).toBe("octocat");
    expect(line.eventsNew).toBe(4);
    expect(line.xpAwarded).toBe(120);
    expect(line.durationMs).toBe(2500);
  });

  it("records a partial run as a warning, not an error", () => {
    const { logger, lines } = collector();
    logSyncJob(finishedJob("partial"), logger);

    const line = last(lines);
    expect(line.event).toBe("sync.partial");
    expect(line.level).toBe("warn");
    expect(line.failureReason).toBe("ceiling_reached");
  });

  it("records a failed run as an error carrying the reason", () => {
    const { logger, lines } = collector();
    logSyncJob(finishedJob("failed"), logger);

    const line = last(lines);
    expect(line.event).toBe("sync.failed");
    expect(line.level).toBe("error");
    expect(line.failureReason).toBe("unavailable");
  });

  it("has a null duration while a job is still running", () => {
    const job = startSyncJob({ id: "j", developerLogin: "x", startedAt: "2026-10-13T00:00:00.000Z" });
    expect(syncJobFields(job).durationMs).toBeNull();
  });
});

describe("logRecoveryDecision", () => {
  it("logs a retry at info and a stop at warn", () => {
    const { logger, lines } = collector();

    logRecoveryDecision(
      decideRecovery({ reason: "unavailable", attempt: 1, recordedProgress: false }),
      { developerLogin: "octocat" },
      logger,
    );
    expect(last(lines).level).toBe("info");

    logRecoveryDecision(
      decideRecovery({ reason: "invalid_username", attempt: 1, recordedProgress: false }),
      { developerLogin: "octocat" },
      logger,
    );
    expect(last(lines).level).toBe("warn");
    expect(last(lines).action).toBe("stop_failed");
  });
});

describe("rate-limit visibility", () => {
  const healthy: RateLimitState = { limit: 5000, remaining: 4999, resetsAt: null, retryAfterMs: null, observedAt: 0 };
  const exhausted: RateLimitState = { limit: 60, remaining: 0, resetsAt: 1, retryAfterMs: null, observedAt: 0 };

  it("treats an exhausted budget as concerning and a healthy one as not", () => {
    expect(rateLimitIsConcerning(exhausted)).toBe(true);
    expect(rateLimitIsConcerning(healthy)).toBe(false);
  });

  it("emits a healthy snapshot at debug and an exhausted one at warn", () => {
    const { logger, lines } = collector();

    logRateLimit(healthy, { operation: "profile" }, logger);
    expect(last(lines).level).toBe("debug");

    logRateLimit(exhausted, { operation: "profile" }, logger);
    expect(last(lines).level).toBe("warn");
    expect(last(lines).exhausted).toBe(true);
  });
});

describe("logIngestionFailure", () => {
  it("treats an expected answer as info and an incident as warn", () => {
    const { logger, lines } = collector();

    logIngestionFailure("not_found", { operation: "profile", login: "ghost" }, logger);
    expect(last(lines).level).toBe("info");

    logIngestionFailure("rate_limited", { operation: "profile", login: "octocat" }, logger);
    expect(last(lines).level).toBe("warn");
    expect(last(lines).reason).toBe("rate_limited");
  });
});

describe("transaction failure visibility", () => {
  const success: PurchaseOutcome = {
    ok: true,
    itemId: "frame-astral",
    cost: 40,
    inventory: {} as never,
    transactions: [],
    balance: 60,
  };
  const refused: PurchaseOutcome = { ok: false, refusal: "insufficient_balance", cost: 40, balance: 10 };
  const inconsistency: PurchaseOutcome = { ok: false, refusal: "already_charged", cost: 40, balance: 10 };

  it("records a success at info with the cost and balance", () => {
    const { logger, lines } = collector();
    logTransaction(success, { userId: "u1", itemId: "frame-astral" }, logger);

    expect(last(lines).event).toBe("shop.transaction_succeeded");
    expect(last(lines).cost).toBe(40);
    expect(last(lines).balance).toBe(60);
  });

  it("records a user-facing refusal at info, not as an error", () => {
    const { logger, lines } = collector();
    logTransaction(refused, { userId: "u1", itemId: "frame-astral" }, logger);

    expect(last(lines).level).toBe("info");
    expect(last(lines).refusal).toBe("insufficient_balance");
  });

  it("records the unreachable charged-without-granted state as an error", () => {
    const { logger, lines } = collector();
    logTransaction(inconsistency, { userId: "u1", itemId: "frame-astral" }, logger);

    expect(last(lines).level).toBe("error");
    expect(last(lines).refusal).toBe("already_charged");
  });
});

describe("logAccountClaim", () => {
  it("logs the fingerprint, never a token", () => {
    const { logger, lines } = collector();
    logAccountClaim(
      { login: "octocat", githubId: 1, existing: false, tokenFingerprint: "ab12cd34" },
      logger,
    );

    expect(last(lines).event).toBe("auth.account_claimed");
    expect(last(lines).fingerprint).toBe("ab12cd34");
    // The field is named "fingerprint", not "tokenFingerprint", so the logger's
    // name-based redaction does not blank a value that is safe by construction.
    expect(last(lines)).not.toHaveProperty("tokenFingerprint");
  });
});

describe("serviceLogger", () => {
  it("returns the same logger for the same service name", () => {
    expect(serviceLogger("shop")).toBe(serviceLogger("shop"));
    expect(serviceLogger("shop")).not.toBe(serviceLogger("sync"));
  });
});