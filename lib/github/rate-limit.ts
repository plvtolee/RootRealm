/**
 * RootRealm — GitHub rate-limit state (TASKS 4.1 "rate-limit awareness").
 *
 * GitHub reports the primary limit on every response through
 * `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset`
 * (epoch seconds), and the secondary limit through `retry-after`. We read all
 * of them because ingestion has to be able to answer three questions without
 * making a request: is another call safe now, how long until the budget
 * resets, and should the caller surface a limit rather than an empty result.
 */

export interface RateLimitState {
  /** Requests allowed per window. */
  limit: number | null;
  /** Requests left in the current window. */
  remaining: number | null;
  /** Epoch milliseconds at which `remaining` resets. */
  resetsAt: number | null;
  /** Milliseconds GitHub asked us to wait, when it said so. */
  retryAfterMs: number | null;
  /** When this snapshot was recorded (epoch milliseconds). */
  observedAt: number;
}

const EMPTY: RateLimitState = {
  limit: null,
  remaining: null,
  resetsAt: null,
  retryAfterMs: null,
  observedAt: 0,
};

function headerInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Reads the rate-limit headers. GitHub sends `x-ratelimit-reset` as epoch
 * *seconds*, which is a common source of off-by-1000 bugs, so the conversion
 * happens exactly here.
 */
export function readRateLimit(headers: Headers): Partial<RateLimitState> {
  const resetSeconds = headerInt(headers, "x-ratelimit-reset");
  const retryAfter = headerInt(headers, "retry-after");

  const state: Partial<RateLimitState> = {};

  const limit = headerInt(headers, "x-ratelimit-limit");
  if (limit !== null) state.limit = limit;

  const remaining = headerInt(headers, "x-ratelimit-remaining");
  if (remaining !== null) state.remaining = remaining;

  if (resetSeconds !== null) state.resetsAt = resetSeconds * 1000;

  // `retry-after` may be seconds or an HTTP date; only the numeric form is
  // supported, which is all GitHub sends today.
  if (retryAfter !== null) state.retryAfterMs = retryAfter * 1000;

  return state;
}

/**
 * Mutable tracker held by one client instance. Requests are serialised through
 * the client, so a single latest-snapshot record is sufficient — TASKS 4.7
 * will extend this to per-endpoint coverage, not to a full history.
 */
export class RateLimitTracker {
  private state: RateLimitState = EMPTY;

  /** Folds a response's headers into the tracked state. */
  observe(headers: Headers, now: number): RateLimitState {
    const next = readRateLimit(headers);
    this.state = { ...this.state, ...next, observedAt: now };
    return this.state;
  }

  /** The latest observed state; the empty state before the first request. */
  snapshot(): RateLimitState {
    return this.state;
  }

  /** True when the budget is known to be exhausted. */
  get exhausted(): boolean {
    return this.state.remaining === 0;
  }

  /**
   * True when another request would consume a request the caller probably
   * cannot afford. Unknown budgets (`remaining === null`) are treated as
   * available, because refusing on missing data would break unauthenticated
   * fixtures.
   */
  canRequest(reserve = 0): boolean {
    const { remaining } = this.state;
    if (remaining === null) return true;
    return remaining > reserve;
  }

  /**
   * Milliseconds until the budget resets, floored at zero. Returns `null` when
   * GitHub has not told us.
   */
  msUntilReset(now: number): number | null {
    if (this.state.resetsAt === null) return null;
    return Math.max(0, this.state.resetsAt - now);
  }
}