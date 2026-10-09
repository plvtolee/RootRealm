import { describe, expect, it } from "vitest";

import { RateLimitTracker, readRateLimit } from "./rate-limit";

const NOW = 1_700_000_000_000;

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("readRateLimit", () => {
  it("converts the epoch-second reset header to milliseconds", () => {
    const state = readRateLimit(
      headers({
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(NOW / 1000 + 60),
      }),
    );

    expect(state.limit).toBe(5000);
    expect(state.remaining).toBe(0);
    expect(state.resetsAt).toBe(NOW + 60_000);
  });

  it("converts Retry-After seconds to milliseconds", () => {
    const state = readRateLimit(headers({ "retry-after": "30" }));
    expect(state.retryAfterMs).toBe(30_000);
  });

  it("omits absent and unparsable headers", () => {
    const state = readRateLimit(headers({ "x-ratelimit-limit": "many" }));
    expect(state).toEqual({});
  });
});

describe("RateLimitTracker", () => {
  it("starts from an unknown state and still allows requests", () => {
    const tracker = new RateLimitTracker();
    expect(tracker.snapshot().remaining).toBeNull();
    expect(tracker.exhausted).toBe(false);
    expect(tracker.canRequest()).toBe(true);
    expect(tracker.msUntilReset(NOW)).toBeNull();
  });

  it("folds successive responses into the latest snapshot", () => {
    const tracker = new RateLimitTracker();

    tracker.observe(headers({ "x-ratelimit-remaining": "4999" }), NOW);
    tracker.observe(headers({ "x-ratelimit-remaining": "4998" }), NOW + 1);

    expect(tracker.snapshot().remaining).toBe(4998);
    expect(tracker.snapshot().observedAt).toBe(NOW + 1);
    expect(tracker.canRequest()).toBe(true);
  });

  it("reports exhaustion and the wait once the budget hits zero", () => {
    const tracker = new RateLimitTracker();
    tracker.observe(
      headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String((NOW + 30_000) / 1000),
      }),
      NOW,
    );

    expect(tracker.exhausted).toBe(true);
    expect(tracker.canRequest()).toBe(false);
    expect(tracker.canRequest(-1)).toBe(true);
    expect(tracker.msUntilReset(NOW)).toBe(30_000);
  });

  it("never reports a negative wait after the reset has passed", () => {
    const tracker = new RateLimitTracker();
    tracker.observe(headers({ "x-ratelimit-reset": String((NOW - 10_000) / 1000) }), NOW);
    expect(tracker.msUntilReset(NOW)).toBe(0);
  });
});