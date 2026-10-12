import { describe, expect, it, vi } from "vitest";

import { withRetries } from "./recovery";

/** A sleep that never actually waits, recording the requested delays. */
function fakeSleep() {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms);
    },
  };
}

describe("withRetries (11.4)", () => {
  it("returns immediately on success without sleeping", async () => {
    const { delays, sleep } = fakeSleep();
    const result = await withRetries(async () => ({ ok: true, value: 42 }), { sleep });

    expect(result).toEqual({ ok: true, value: 42, attempts: 1 });
    expect(delays).toEqual([]);
  });

  it("retries a transient failure and succeeds", async () => {
    const { delays, sleep } = fakeSleep();
    let calls = 0;

    const result = await withRetries(
      async () => {
        calls += 1;
        return calls < 2 ? { ok: false, reason: "unavailable" as const } : { ok: true, value: "done" };
      },
      { sleep },
    );

    expect(result).toEqual({ ok: true, value: "done", attempts: 2 });
    expect(delays).toHaveLength(1);
  });

  it("gives up after the attempt ceiling", async () => {
    const { sleep } = fakeSleep();
    const operation = vi.fn().mockResolvedValue({ ok: false, reason: "unavailable" });

    const result = await withRetries(operation, { sleep, policy: { baseDelayMs: 1, maxDelayMs: 2, maxAttempts: 3 } });

    expect(operation).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.attempts).toBe(3);
  });

  it("does not retry a not_found", async () => {
    const { sleep } = fakeSleep();
    const operation = vi.fn().mockResolvedValue({ ok: false, reason: "not_found" });

    const result = await withRetries(operation, { sleep });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.partial).toBe(false);
  });

  it("honours the rate-limit delay", async () => {
    const { delays, sleep } = fakeSleep();
    let calls = 0;

    await withRetries(
      async () => {
        calls += 1;
        return calls === 1
          ? { ok: false, reason: "rate_limited" as const, retryAfterMs: 7_000 }
          : { ok: true, value: true };
      },
      { sleep },
    );

    expect(delays).toEqual([7_000]);
  });

  it("reports a partial outcome when progress was recorded", async () => {
    const { sleep } = fakeSleep();

    const result = await withRetries(
      async () => ({ ok: false, reason: "unavailable" as const }),
      { sleep, recordedProgress: () => true, policy: { baseDelayMs: 1, maxDelayMs: 1, maxAttempts: 1 } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.partial).toBe(true);
      expect(result.reason).toBe("unavailable");
    }
  });

  it("reports a clean failure when nothing was recorded", async () => {
    const { sleep } = fakeSleep();

    const result = await withRetries(
      async () => ({ ok: false, reason: "unavailable" as const }),
      { sleep, recordedProgress: () => false, policy: { baseDelayMs: 1, maxDelayMs: 1, maxAttempts: 1 } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.partial).toBe(false);
  });
});