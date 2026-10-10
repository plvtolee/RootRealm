import { describe, expect, it } from "vitest";

import {
  buildCoverage,
  type CoverageInput,
  type CoverageReport,
} from "./coverage";
import type { EventLimitation } from "./developer-event";
import type { NormalizationResult } from "./developer-event";
import type { DedupeResult } from "./event-dedupe";
import type { RepositoryObservation } from "./github/repositories";
import type { ActivityObservation } from "./github/activity";

/**
 * Observations shaped like the ones captured from the live API on 2026-10-10,
 * so a report is exercised against the numbers a real run produces rather than
 * against invented ones.
 */

const KINDS = {
  push: 0,
  pull_request: 0,
  review: 0,
  issue: 0,
  release: 0,
  documentation: 0,
  lifecycle: 0,
};

function repositories(
  over: Partial<RepositoryObservation> = {},
): RepositoryObservation {
  return {
    repositories: [],
    count: 8,
    pages: 1,
    truncated: false,
    oldestCreatedAt: "2011-01-26T19:01:12Z",
    latestActivityAt: "2024-08-21T15:25:42Z",
    ...over,
  };
}

function activity(
  over: Partial<ActivityObservation> = {},
): ActivityObservation {
  return {
    events: [],
    count: 300,
    pages: 3,
    truncated: false,
    atCeiling: true,
    oldestAt: "2026-10-09T03:13:25Z",
    newestAt: "2026-10-09T22:31:27Z",
    byType: { PushEvent: 103, PullRequestEvent: 70 },
    byRelevance: { scored: 228, weak: 71, ignored: 1 },
    partial: {
      omittedFields: {
        "PushEvent.commits": 103,
        "PullRequestEvent.additions": 70,
      },
      pushesWithoutCommitList: 103,
      pullRequestsWithoutDiffStats: 70,
    },
    ...over,
  };
}

function normalized(
  over: Partial<NormalizationResult> = {},
): NormalizationResult {
  return {
    events: [],
    unsupported: [],
    byKind: { ...KINDS },
    byConfidence: { verified: 299, inferred: 0 },
    ...over,
  };
}

function deduplicated(
  over: Partial<DedupeResult> = {},
): DedupeResult {
  return {
    events: [],
    duplicates: [],
    alreadySeen: [],
    ...over,
  };
}

/** Canonical events carrying one limitation, `count` of them. */
function eventsWithLimitations(limit: EventLimitation, count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `push:${index}`,
    kind: "push" as const,
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-09T05:51:24Z",
    visibility: "public" as const,
    confidence: "verified" as const,
    sourceUrl: null,
    relevance: "scored" as const,
    limitations: [limit],
    evidence: { branch: "main", headSha: "abc", beforeSha: "def", pushId: "1" },
  }));
}

function input(over: Partial<CoverageInput> = {}): CoverageInput {
  return {
    login: "octocat",
    githubId: 583_231,
    declaredRepositoryCount: 8,
    repositories: repositories(),
    activity: activity(),
    normalized: normalized(),
    deduplicated: deduplicated(),
    ...over,
  };
}

/**
 * An internally consistent run: 300 observed events, 299 of which normalize and
 * 1 of which is a fork with no canonical form, and no repeats.
 *
 * The stages are only meaningful together, so a test that overrides one can
 * override from this base rather than guessing what the others should be.
 */
function consistentInput(over: Partial<CoverageInput> = {}): CoverageInput {
  const observed = over.activity?.count ?? 300;
  const unsupported = over.normalized?.unsupported?.length ?? 1;
  const canonical = observed - unsupported;

  return input({
    activity: activity({
      count: observed,
      byType: { PushEvent: canonical },
      byRelevance: { scored: canonical, weak: 0, ignored: 0 },
    }),
    normalized: normalized({
      events: eventsWithLimitations("commit_count_unavailable", canonical),
      unsupported: [{ type: "ForkEvent", count: 1, relevance: "ignored" }],
      byKind: { ...KINDS, push: canonical },
      byConfidence: { verified: canonical, inferred: 0 },
    }),
    deduplicated: deduplicated({
      events: eventsWithLimitations("commit_count_unavailable", canonical),
    }),
    ...over,
  });
}

/**
 * A report built on an internally consistent run.
 *
 * Takes the knobs a test actually wants to turn rather than whole stage
 * objects, because the three stages are only meaningful together — overriding
 * one silently desynchronizes the other two, which is how a coverage test
 * comes to assert a contradiction.
 *
 * `limitation` defaults to the commit-list gap, because that is what every real
 * walk produces. Pass `null` for limitation-free events — note that is only
 * achievable with event kinds that carry no known gap, such as releases, since a
 * push always lacks a commit list.
 */
function consistentReport(over: {
  observedEvents?: number;
  unsupported?: number;
  /** Observations collapsed as repeats; 0 for a single walk. */
  duplicates?: number;
  repositoryCount?: number;
  repositoryPages?: number;
  repositoryTruncated?: boolean;
  activityPages?: number;
  atCeiling?: boolean;
  limitation?: EventLimitation | null;
} = {}): CoverageReport {
  const observed = over.observedEvents ?? 300;
  const unsupported = over.unsupported ?? 1;
  const duplicates = over.duplicates ?? 0;
  const canonical = observed - unsupported;
  // Defaulted only on `undefined`, not on `null` — `null` is the meaningful
  // argument for "no limitations", which `??` would silently override.
  const limitation =
    over.limitation === undefined ? "commit_count_unavailable" : over.limitation;

  const events =
    limitation === null
      ? Array.from({ length: canonical }, (_unused, index) => ({
          id: `release:${index}`,
          kind: "release" as const,
          developerLogin: "octocat",
          developerId: 583_231,
          repositoryId: 170_270,
          repositoryFullName: "octocat/octo-repo",
          occurredAt: "2026-10-09T05:51:24Z",
          visibility: "public" as const,
          confidence: "verified" as const,
          sourceUrl: null,
          relevance: "scored" as const,
          limitations: [] as EventLimitation[],
          evidence: {
            tag: "v1",
            name: "One",
            draft: false,
            prerelease: false,
          },
        }))
      : eventsWithLimitations(limitation, canonical);

  const normalizedEvents = events;
  const deduplicatedEvents = normalizedEvents.slice(duplicates);

  // The unsupported entries must sum to `unsupported`, or the run does not
  // reconcile — which is the very failure this helper exists to avoid.
  const unsupportedEntries = Array.from(
    { length: Math.max(0, unsupported) },
    () => ({ type: "ForkEvent", count: 1, relevance: "ignored" as const }),
  );

  return buildCoverage({
    login: "octocat",
    githubId: 583_231,
    declaredRepositoryCount: over.repositoryCount ?? 8,
    repositories: repositories({
      count: over.repositoryCount ?? 8,
      pages: over.repositoryPages ?? 1,
      truncated: over.repositoryTruncated ?? false,
    }),
    activity: activity({
      count: observed,
      pages: over.activityPages ?? 1,
      atCeiling: over.atCeiling ?? false,
      byType: { PushEvent: canonical },
      byRelevance: { scored: canonical, weak: 0, ignored: 0 },
    }),
    normalized: normalized({
      events: normalizedEvents,
      unsupported: unsupportedEntries,
      byKind: { ...KINDS, push: canonical },
      byConfidence: { verified: canonical, inferred: 0 },
    }),
    deduplicated: deduplicated({ events: deduplicatedEvents }),
  });
}

const report = (over: Partial<CoverageInput> = {}): CoverageReport =>
  buildCoverage(input(over));

/* -------------------------------------------------------------------------- */

describe("buildCoverage — repository count", () => {
  it("reports what was observed", () => {
    expect(report().repositories.observed).toBe(8);
  });

  it("carries GitHub's own count alongside it as an independent check", () => {
    // public_repos is the only number that can disagree with the walk.
    expect(report().repositories.declared).toBe(8);
  });

  it("computes the shortfall when GitHub reported more than was walked", () => {
    // The live case: a developer with >1000 repositories walks only 1000.
    const result = report({
      repositories: repositories({ count: 1000, truncated: true }),
      declaredRepositoryCount: 1500,
    });

    expect(result.repositories.shortfall).toBe(500);
  });

  it("reports no shortfall when the walk met or exceeded GitHub's count", () => {
    expect(
      report({
        repositories: repositories({ count: 8 }),
        declaredRepositoryCount: 8,
      }).repositories.shortfall,
    ).toBeNull();
  });

  it("reports no shortfall when GitHub's count is unknown", () => {
    expect(
      report({ declaredRepositoryCount: null }).repositories.shortfall,
    ).toBeNull();
  });

  it("does not report a negative shortfall when the walk sees more", () => {
    // A newly created repository can make the walk exceed the profile's count.
    expect(
      report({
        repositories: repositories({ count: 9 }),
        declaredRepositoryCount: 8,
      }).repositories.shortfall,
    ).toBeNull();
  });

  it("reports the creation window, which is repository age not activity", () => {
    // Oldest creation and newest push are separate facts: last activity is not
    // creation, and folding them together would let "pushed to recently" be read
    // as "created recently".
    const result = report({
      repositories: repositories({
        oldestCreatedAt: "2011-01-26T19:01:12Z",
        latestActivityAt: "2024-08-21T15:25:42Z",
      }),
    });

    expect(result.repositories.oldestCreatedAt).toBe("2011-01-26T19:01:12Z");
    expect(result.repositories.lastActivityAt).toBe("2024-08-21T15:25:42Z");
  });
});

describe("buildCoverage — event count", () => {
  it("reports what was observed", () => {
    expect(report().activity.observed).toBe(300);
  });

  it("attributes the event count across sources", () => {
    expect(report().activity.byType).toEqual({
      PushEvent: 103,
      PullRequestEvent: 70,
    });
  });

  it("attributes relevance as well", () => {
    expect(report().activity.byRelevance).toEqual({
      scored: 228,
      weak: 71,
      ignored: 1,
    });
  });
});

describe("buildCoverage — time range", () => {
  it("reports the observed event window", () => {
    expect(report().activity.eventWindow).toEqual({
      oldest: "2026-10-09T03:13:25Z",
      newest: "2026-10-09T22:31:27Z",
    });
  });

  it("reports nulls for an empty run rather than inventing a range", () => {
    const result = report({
      activity: activity({
        count: 0,
        oldestAt: null,
        newestAt: null,
        byType: {},
        byRelevance: { scored: 0, weak: 0, ignored: 0 },
      }),
    });

    expect(result.activity.eventWindow).toEqual({ oldest: null, newest: null });
  });

  it("does not present the window as a coverage boundary", () => {
    // The field is documented as a true min/max that covers no days: a
    // backfilled event sits years past everything else in the same feed.
    const result = report({
      activity: activity({
        oldestAt: "2024-08-28T05:10:42Z",
        newestAt: "2026-10-09T22:31:27Z",
      }),
    });

    expect(result.activity.eventWindow.oldest).toBe("2024-08-28T05:10:42Z");
    expect(result.limitations.map((l) => l.code)).not.toContain("activity_window");
  });
});

describe("buildCoverage — pagination completeness", () => {
  it("marks an exhausted walk complete", () => {
    const result = consistentReport({ observedEvents: 8, unsupported: 0 });

    expect(result.repositories.pagination.stoppedBy).toBe("exhausted");
    expect(result.repositories.pagination.complete).toBe(true);
    expect(result.activity.pagination.stoppedBy).toBe("exhausted");
    expect(result.activity.pagination.complete).toBe(true);
    expect(result.complete).toBe(true);
  });

  it("marks a walk stopped by our own cap", () => {
    const result = report({
      repositories: repositories({ truncated: true, pages: 10, count: 1000 }),
    });

    // GitHub still offered a next page; the cap stopped us.
    expect(result.repositories.pagination.stoppedBy).toBe("page_cap");
    expect(result.repositories.pagination.truncated).toBe(true);
    expect(result.repositories.pagination.complete).toBe(false);
    expect(result.complete).toBe(false);
  });

  it("distinguishes GitHub's own ceiling from our cap", () => {
    const result = report({ activity: activity({ atCeiling: true, truncated: false }) });

    // Both bound the data, but only one is ours, and a consumer must not treat
    // a 300-event ceiling as an incomplete ingestion on our part.
    expect(result.activity.pagination.stoppedBy).toBe("server_ceiling");
    expect(result.activity.pagination.truncated).toBe(false);
    expect(result.activity.atCeiling).toBe(true);
  });

  it("still refuses to call a server-capped walk complete", () => {
    const result = report({ activity: activity({ atCeiling: true }) });

    expect(result.activity.pagination.complete).toBe(false);
    expect(result.complete).toBe(false);
  });

  it("reports a cap-driven stop for activity when we truncated it", () => {
    const result = report({
      activity: activity({ truncated: true, pages: 3, atCeiling: false }),
    });

    expect(result.activity.pagination.stoppedBy).toBe("page_cap");
  });
});

describe("buildCoverage — reconciliation", () => {
  it("balances when observed equals normalized plus unsupported", () => {
    // 300 observed, 299 with a canonical form, 1 fork without one.
    const result = consistentReport();

    expect(result.reconciliation.balanced).toBe(true);
    expect(result.reconciliation).toMatchObject({
      observed: 300,
      normalized: 299,
      unsupported: 1,
      canonical: 299,
      duplicatesCollapsed: 0,
    });
  });

  it("fails the balance when input was silently dropped", () => {
    const result = report({
      normalized: normalized({ events: [] }),
    });

    // 300 observed, nothing normalized, nothing recorded as unsupported.
    expect(result.reconciliation.balanced).toBe(false);
    expect(result.complete).toBe(false);
  });

  it("counts collapsed duplicates so inputs and outputs reconcile", () => {
    const result = consistentReport();

    // A single walk with no repeats.
    expect(result.reconciliation.duplicatesCollapsed).toBe(0);
  });

  it("clamps rather than reporting a nonsense negative when stages disagree", () => {
    // A caller passing a deduplicated set smaller than what normalized reported
    // is a bug, but a coverage report must not invent -300 collapsed events.
    const result = report({
      normalized: normalized({ events: [] }),
      deduplicated: deduplicated({
        events: eventsWithLimitations("commit_count_unavailable", 5),
      }),
    });

    expect(result.reconciliation.duplicatesCollapsed).toBe(0);
    // `balanced` is the check that actually catches the inconsistent pipeline.
    expect(result.reconciliation.balanced).toBe(false);
  });

  it("reports duplicates collapsed from a repeated sync", () => {
    // 600 observations, none unconverted, collapsing to 300 identities.
    const result = consistentReport({
      observedEvents: 600,
      unsupported: 0,
      duplicates: 300,
    });

    expect(result.reconciliation.duplicatesCollapsed).toBe(300);
    expect(result.reconciliation.canonical).toBe(300);
    expect(result.reconciliation.balanced).toBe(true);
  });

  it("counts every unsupported type, not just the first", () => {
    const result = report({
      normalized: normalized({
        unsupported: [
          { type: "ForkEvent", count: 1, relevance: "ignored" },
          { type: "WatchEvent", count: 2, relevance: "ignored" },
        ],
      }),
    });

    expect(result.reconciliation.unsupported).toBe(3);
  });
});

describe("buildCoverage — limitations", () => {
  it("aggregates per-event limitations with their consequences", () => {
    const result = report({
      deduplicated: deduplicated({
        events: eventsWithLimitations("commit_count_unavailable", 103),
      }),
    });

    const commitLimit = result.limitations.find(
      (l) => l.code === "commit_count_unavailable",
    );

    expect(commitLimit).toMatchObject({
      count: 103,
      implication:
        "Commit volume cannot be scored from this run — a push event carries no commit list.",
    });
  });

  it("orders limitations by how much they affect", () => {
    const result = report({
      deduplicated: deduplicated({
        events: [
          ...eventsWithLimitations("diff_stats_unavailable", 70),
          ...eventsWithLimitations("commit_count_unavailable", 103),
        ],
      }),
    });

    expect(result.limitations.slice(0, 2).map((l) => l.code)).toEqual([
      "commit_count_unavailable",
      "diff_stats_unavailable",
    ]);
  });

  it("describes an unknown limitation code rather than dropping it", () => {
    const malformed = eventsWithLimitations("some_new_limitation" as EventLimitation, 2);

    const result = report({
      deduplicated: deduplicated({ events: malformed as never }),
    });

    // A new limitation code must surface rather than vanish, even without prose.
    const entry = result.limitations.find(
      (l) => l.code === "some_new_limitation",
    );
    expect(entry?.count).toBe(2);
    expect(entry?.implication).toBe("Consequence not characterised.");
  });

  it("flags a truncated repository inventory as a limit on repository coverage", () => {
    const result = report({
      repositories: repositories({ truncated: true }),
    });

    // Absence of a repository is not evidence it does not exist.
    expect(
      result.limitations.find((l) => l.code === "repository_inventory_truncated")
        ?.implication,
    ).toContain("absence of a repository is not evidence");
  });

  it("flags the activity ceiling with what it prevents concluding", () => {
    const result = report({ activity: activity({ atCeiling: true }) });

    const ceiling = result.limitations.find(
      (l) => l.code === "activity_ceiling_reached",
    );
    expect(ceiling?.count).toBe(300);
    expect(ceiling?.implication).toContain("not a measure of the developer's history");
  });

  it("flags events with no canonical form", () => {
    const result = report({
      normalized: normalized({
        unsupported: [{ type: "ForkEvent", count: 1, relevance: "ignored" }],
      }),
    });

    expect(
      result.limitations.find((l) => l.code === "events_without_canonical_form")
        ?.count,
    ).toBe(1);
  });

  it("reports no limitations for a clean complete run", () => {
    // Release events carry no known gap, eight of them, no repeats. A run
    // containing pushes could not reach zero limitations by construction.
    const result = consistentReport({
      observedEvents: 8,
      unsupported: 0,
      limitation: null,
    });

    expect(result.limitations).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("never reaches zero limitations while pushes are present", () => {
    // The commit-list gap is a property of the feed, not of the run, so
    // "complete" and "no limitations" are independent claims.
    const result = consistentReport({
      observedEvents: 8,
      unsupported: 0,
      limitation: "commit_count_unavailable",
    });

    expect(result.complete).toBe(true);
    expect(result.limitations.map((l) => l.code)).toEqual([
      "commit_count_unavailable",
    ]);
  });
});

describe("buildCoverage — developer identity", () => {
  it("records who the run was for", () => {
    const result = report({ login: "sindresorhus", githubId: 170_270 });

    expect(result.login).toBe("sindresorhus");
    expect(result.githubId).toBe(170_270);
  });

  it("records a missing numeric id as null rather than guessing", () => {
    expect(report({ githubId: null }).githubId).toBeNull();
  });
});

describe("buildCoverage — determinism", () => {
  it("produces the same report for the same input", () => {
    const shared = input();

    expect(buildCoverage(shared)).toEqual(buildCoverage(shared));
  });

  it("does not mutate its input", () => {
    const shared = input();
    const before = JSON.stringify(shared);

    buildCoverage(shared);

    expect(JSON.stringify(shared)).toBe(before);
  });
});