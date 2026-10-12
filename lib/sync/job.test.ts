import { describe, expect, it } from "vitest";

import {
  EMPTY_COUNTERS,
  SYNC_PHASES,
  addCounters,
  completePhase,
  failSyncJob,
  isFinished,
  markPartial,
  remainingPhases,
  startSyncJob,
  succeedSyncJob,
  withCounters,
} from "./job";
import { decideRecovery, statusAfterRecovery } from "./recovery";

const fresh = () => startSyncJob({ id: "job-1", developerLogin: "octocat", startedAt: "t0" });

/** Runs every phase in order. */
function completed() {
  let job = fresh();
  for (const phase of SYNC_PHASES) job = completePhase(job, phase);
  return job;
}

describe("sync job (11.1)", () => {
  it("starts running with no phases done", () => {
    const job = fresh();

    expect(job.status).toBe("running");
    expect(job.completedPhases).toEqual([]);
    expect(job.finishedAt).toBeNull();
    expect(job.counters).toEqual(EMPTY_COUNTERS);
    expect(isFinished(job)).toBe(false);
  });

  it("completes phases in order", () => {
    let job = fresh();
    for (const phase of SYNC_PHASES) {
      job = completePhase(job, phase);
      expect(job.completedPhases).toContain(phase);
    }

    expect(job.completedPhases).toEqual(SYNC_PHASES);
    expect(remainingPhases(job)).toEqual([]);
  });

  it("refuses a phase out of order", () => {
    expect(() => completePhase(fresh(), "score")).toThrow(/cannot follow/);
  });

  it("treats completing the same phase twice as a no-op", () => {
    const once = completePhase(fresh(), "fetch");
    expect(completePhase(once, "fetch")).toBe(once);
  });

  it("only succeeds once every phase has run", () => {
    expect(() => succeedSyncJob(completePhase(fresh(), "fetch"), "t1")).toThrow(/partial or failed/);

    const done = succeedSyncJob(completed(), "t1");
    expect(done.status).toBe("succeeded");
    expect(done.finishedAt).toBe("t1");
    expect(isFinished(done)).toBe(true);
  });

  it("refuses work on a finished job", () => {
    const done = succeedSyncJob(completed(), "t1");
    expect(() => completePhase(done, "fetch")).toThrow(/succeeded job/);
  });

  it("carries counters", () => {
    const job = withCounters(fresh(), { ...EMPTY_COUNTERS, eventsObserved: 300, eventsNew: 12 });
    expect(job.counters.eventsObserved).toBe(300);
    expect(job.counters.eventsNew).toBe(12);
  });

  it("distinguishes partial from failed", () => {
    const partial = markPartial(fresh(), "rate_limited", "t1");
    expect(partial.status).toBe("partial");
    expect(partial.failureReason).toBe("rate_limited");

    const failed = failSyncJob(fresh(), "unavailable", "t1");
    expect(failed.status).toBe("failed");
  });

  it("adds counters for a resumed run", () => {
    const total = addCounters(
      { ...EMPTY_COUNTERS, eventsObserved: 10, xpAwarded: 5 },
      { ...EMPTY_COUNTERS, eventsObserved: 3, xpAwarded: 2 },
    );

    expect(total.eventsObserved).toBe(13);
    expect(total.xpAwarded).toBe(7);
  });
});

describe("recovery (11.4)", () => {
  const base: { attempt: number; recordedProgress: boolean } = { attempt: 1, recordedProgress: false };

  it("retries a transient outage with exponential backoff", () => {
    const first = decideRecovery({ ...base, reason: "unavailable" });
    const second = decideRecovery({ ...base, attempt: 2, reason: "unavailable" });

    expect(first.action).toBe("retry_now");
    expect(second.action).toBe("retry_now");
    expect(second.waitMs).toBeGreaterThan(first.waitMs ?? 0);
  });

  it("caps the backoff", () => {
    const decision = decideRecovery({
      ...base,
      attempt: 2,
      reason: "unexpected_response",
      policy: { baseDelayMs: 1_000, maxDelayMs: 1_500, maxAttempts: 5 },
    });
    expect(decision.waitMs).toBe(1_500);
  });

  it("honours GitHub's stated rate-limit delay rather than its own backoff", () => {
    const decision = decideRecovery({ ...base, reason: "rate_limited", retryAfterMs: 42_000 });

    expect(decision.action).toBe("retry_later");
    expect(decision.waitMs).toBe(42_000);
  });

  it("never retries a missing or invalid account", () => {
    for (const reason of ["not_found", "invalid_username"] as const) {
      const decision = decideRecovery({ ...base, reason });
      expect(decision.retryable).toBe(false);
      expect(decision.action).toBe("stop_failed");
    }
  });

  it("keeps recorded progress when it stops out of attempts", () => {
    const decision = decideRecovery({ ...base, reason: "unavailable", attempt: 3, recordedProgress: true });
    expect(decision.action).toBe("stop_partial");
    expect(statusAfterRecovery(decision)).toBe("partial");
  });

  it("fails, rather than reporting partial, when nothing was recorded", () => {
    const decision = decideRecovery({ ...base, reason: "unavailable", attempt: 3, recordedProgress: false });
    expect(decision.action).toBe("stop_failed");
    expect(statusAfterRecovery(decision)).toBe("failed");
  });

  it("reports the job status each decision leads to", () => {
    expect(statusAfterRecovery(decideRecovery({ ...base, reason: "unavailable" }))).toBe("running");
    expect(
      statusAfterRecovery(decideRecovery({ ...base, reason: "not_found", recordedProgress: false })),
    ).toBe("failed");
  });

  it("stops a rate limit that is out of attempts as partial", () => {
    const decision = decideRecovery({
      ...base,
      attempt: 3,
      reason: "rate_limited",
      retryAfterMs: 1_000,
      recordedProgress: true,
    });

    expect(decision.action).toBe("stop_partial");
    expect(decision.retryable).toBe(false);
  });
});