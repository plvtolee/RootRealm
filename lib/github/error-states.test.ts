import { describe, expect, it } from "vitest";

import type { CoverageReport } from "../coverage";
import {
  errorStateFor,
  formatRetryDelay,
  noticesFor,
  type NoticeKind,
} from "./error-states";
import type { FailureReason } from "./failure";

const REASONS: FailureReason[] = [
  "invalid_username",
  "not_found",
  "rate_limited",
  "unavailable",
  "unexpected_response",
];

/* -------------------------------------------------------------------------- */

describe("errorStateFor — every reason is handled", () => {
  it.each(REASONS)("gives %s a title, message and severity", (reason) => {
    const state = errorStateFor(reason);

    expect(state.reason).toBe(reason);
    expect(state.title.length).toBeGreaterThan(0);
    expect(state.message.length).toBeGreaterThan(0);
    expect(["blocking", "degraded", "warning"]).toContain(state.severity);
  });

  it("never exposes a token, a URL or a stack trace in user copy", () => {
    for (const reason of REASONS) {
      const state = errorStateFor(reason);
      const text = `${state.title} ${state.message} ${state.nextAction ?? ""}`;

      expect(text).not.toMatch(/ghp_|token|Bearer|https?:\/\/api\.github/i);
      expect(text).not.toMatch(/\bat \w+:\d+/);
    }
  });

  it("tells the user what to do for every retryable state", () => {
    for (const reason of REASONS.filter((r) => errorStateFor(r).retryable)) {
      expect(errorStateFor(reason).nextAction).not.toBeNull();
    }
  });
});

describe("errorStateFor — the deleted/renamed user fix", () => {
  it("does not claim an account never existed", () => {
    // A deleted account and a username that never existed both return a 404, so
    // the stronger claim is unobservable. Verified against the live API.
    const state = errorStateFor("not_found");

    expect(state.message).not.toContain("does not exist");
    expect(state.message).not.toContain("no such");
    expect(state.message).toContain("renamed or deleted");
  });

  it("points at the likely cause instead of the user's typing", () => {
    const state = errorStateFor("not_found");

    expect(state.nextAction).toContain("current username");
    expect(state.nextAction).toContain("renamed");
  });

  it("is not retryable, because an identical request returns the same 404", () => {
    expect(errorStateFor("not_found").retryable).toBe(false);
  });

  it("is not retryable for a malformed username either", () => {
    // An identical request returns the identical 400, so waiting helps none.
    expect(errorStateFor("invalid_username").retryable).toBe(false);
  });
});

describe("errorStateFor — rate limiting", () => {
  it("is retryable and carries the delay it was given", () => {
    const state = errorStateFor("rate_limited", 60_000);

    expect(state.retryable).toBe(true);
    expect(state.retryAfterMs).toBe(60_000);
    expect(state.title).toContain("rate limit");
  });

  it("degrades nothing on its own — a spent budget blocks the whole lookup", () => {
    expect(errorStateFor("rate_limited").severity).toBe("blocking");
  });
});

describe("errorStateFor — severity override", () => {
  it("defaults failures to blocking", () => {
    expect(errorStateFor("unavailable").severity).toBe("blocking");
  });

  it("lets a partial lookup be reported as degraded rather than blocking", () => {
    // A repository lookup failing while the profile resolved costs one section,
    // not the screen the user came for.
    expect(errorStateFor("unavailable", null, "degraded").severity).toBe("degraded");
  });

  it("keeps the reason when severity changes", () => {
    expect(errorStateFor("not_found", null, "degraded").reason).toBe("not_found");
  });
});

describe("errorStateFor — malformed response", () => {
  it("is not retryable and asks for a report", () => {
    const state = errorStateFor("unexpected_response");

    // The one failure where an identical retry is pointless by definition.
    expect(state.retryable).toBe(false);
    expect(state.nextAction).toContain("report");
  });
});

/* -------------------------------------------------------------------------- */

function coverage(over: Partial<CoverageReport> = {}): CoverageReport {
  return {
    login: "octocat",
    githubId: 583_231,
    repositories: {
      observed: 8,
      declared: 8,
      shortfall: null,
      pagination: {
        pages: 1,
        truncated: false,
        stoppedBy: "exhausted",
        complete: true,
      },
      oldestCreatedAt: "2011-01-26T19:01:12Z",
      lastActivityAt: "2024-08-21T15:25:42Z",
    },
    activity: {
      observed: 12,
      pagination: {
        pages: 1,
        truncated: false,
        stoppedBy: "exhausted",
        complete: true,
      },
      atCeiling: false,
      eventWindow: { oldest: "2026-10-01T00:00:00Z", newest: "2026-10-09T00:00:00Z" },
      byType: { PushEvent: 12 },
      byRelevance: { scored: 12, weak: 0, ignored: 0 },
    },
    reconciliation: {
      observed: 12,
      normalized: 12,
      unsupported: 0,
      balanced: true,
      canonical: 12,
      duplicatesCollapsed: 0,
    },
    limitations: [],
    complete: true,
    ...over,
  };
}

const kinds = (report: CoverageReport): NoticeKind[] =>
  noticesFor(report).map((notice) => notice.kind);

describe("noticesFor — empty activity is not an error", () => {
  it("reports it as a notice, not a failure", () => {
    const result = noticesFor(coverage({
      activity: {
        ...coverage().activity,
        observed: 0,
        byType: {},
        byRelevance: { scored: 0, weak: 0, ignored: 0 },
      },
    }));

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("empty_activity");
    expect(result[0].message).toContain("not an error");
  });

  it("says there is nothing to score rather than implying a broken lookup", () => {
    const notice = noticesFor(coverage({
      activity: { ...coverage().activity, observed: 0 },
    }))[0];

    expect(notice.message).toContain("nothing to score");
    expect(notice.message).not.toContain("failed");
  });
});

describe("noticesFor — partial pagination is not an error", () => {
  it("reports GitHub's activity ceiling as a notice", () => {
    const ceiling = coverage({
      activity: {
        ...coverage().activity,
        observed: 300,
        atCeiling: true,
        pagination: { pages: 3, truncated: false, stoppedBy: "server_ceiling", complete: false },
      },
    });

    expect(kinds(ceiling)).toContain("partial_pagination");
  });

  it("distinguishes a server ceiling from our own page cap", () => {
    const ceiling = noticesFor(coverage({
      activity: {
        ...coverage().activity,
        atCeiling: true,
        pagination: { pages: 3, truncated: false, stoppedBy: "server_ceiling", complete: false },
      },
    }))[0];

    // The two have different causes and different expectations, so they must not
    // produce identical copy.
    expect(ceiling.message).toContain("at most 300 events");
  });

  it("reports a repository walk stopped by our cap", () => {
    expect(kinds(coverage({
      repositories: {
        ...coverage().repositories,
        observed: 1000,
        pagination: { pages: 10, truncated: true, stoppedBy: "page_cap", complete: false },
      },
    }))).toContain("partial_pagination");
  });

  it("reports a repository shortfall with the actual gap", () => {
    const result = noticesFor(coverage({
      repositories: {
        ...coverage().repositories,
        observed: 1000,
        declared: 1144,
        shortfall: 144,
        pagination: { pages: 10, truncated: true, stoppedBy: "page_cap", complete: false },
      },
    }));

    const shortfall = result.find((n) => n.kind === "repository_shortfall");
    expect(shortfall?.count).toBe(144);
    expect(shortfall?.message).toContain("1144");
    expect(shortfall?.message).toContain("1000");
  });
});

describe("noticesFor — a clean run", () => {
  it("reports no notices at all", () => {
    // Nothing to caveat is a positive result, not a missing one.
    expect(noticesFor(coverage())).toEqual([]);
  });

  it("does not invent an empty-activity notice when there is activity", () => {
    expect(kinds(coverage())).not.toContain("empty_activity");
  });

  it("orders empty activity first when several notices apply", () => {
    const kinds2 = kinds(coverage({
      activity: { ...coverage().activity, observed: 0, atCeiling: false },
    }));

    expect(kinds2[0]).toBe("empty_activity");
  });
});

describe("formatRetryDelay", () => {
  it("returns null when GitHub gave no delay", () => {
    expect(formatRetryDelay(null)).toBeNull();
  });

  it("returns null for a non-positive delay", () => {
    expect(formatRetryDelay(0)).toBeNull();
    expect(formatRetryDelay(-5)).toBeNull();
  });

  it("formats sub-minute delays in seconds", () => {
    expect(formatRetryDelay(5_000)).toBe("5s");
  });

  it("rounds up so a retry is never early", () => {
    expect(formatRetryDelay(1_100)).toBe("2s");
  });

  it("formats a minute or more in minutes, not 60s", () => {
    // "60s" reads as a second, which invites a retry a minute early.
    expect(formatRetryDelay(60_000)).toBe("1 minute");
    expect(formatRetryDelay(172_800_000)).toBe("2880 minutes");
  });

  it("pluralises correctly", () => {
    expect(formatRetryDelay(120_000)).toBe("2 minutes");
  });
});
