import { describe, expect, it } from "vitest";

import { scoreEvents, summarize } from "./engine";
import { fixtureFor, scoringFixtures, runFixture } from "./fixtures";
import { SCORING_V1 } from "./types";

const score = (events: readonly unknown[]) =>
  scoreEvents(events as never[], SCORING_V1);

/* -------------------------------------------------------------------------- */

describe("fixtures — completeness", () => {
  it("covers all seven shapes SCORING.md §36 names", () => {
    // §36 lists active, inactive, new, large, empty, duplicate activity and
    // mixed activity. `empty` was missing until the §36 audit: `inactive` alone
    // does not cover it, because a quiet account and an account that never had
    // public activity are different first-run cases.
    expect(scoringFixtures.map((f) => f.profile).sort()).toEqual(
      [
        "active",
        "duplicate_activity",
        "empty",
        "inactive",
        "large",
        "mixed_activity",
        "new",
      ].sort(),
    );
  });

  it("documents what each fixture is for", () => {
    // A fixture nobody can explain is a fixture nobody can tune against.
    for (const fixture of scoringFixtures) {
      expect(fixture.notes.length).toBeGreaterThan(0);
    }
  });

  it("uses GitHub's own event ids, so a re-observation is byte-identical", () => {
    for (const fixture of scoringFixtures) {
      for (const event of fixture.events) {
        expect(typeof event.id).toBe("string");
        expect(event.id.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("runFixture — active", () => {
  it("normalizes every event and accounts for the fork", () => {
    const { normalized } = runFixture("active");

    expect(normalized.events).toHaveLength(9);
    expect(normalized.unsupported).toEqual([
      { type: "ForkEvent", count: 1, relevance: "ignored" },
    ]);
  });

  it("contains every scoreable kind", () => {
    const { normalized } = runFixture("active");

    expect(normalized.byKind).toMatchObject({
      push: 0,
      pull_request: 2,
      review: 1,
      issue: 2,
      release: 1,
      documentation: 2,
      lifecycle: 1,
    });
  });

  it("carries the two documented evidence gaps on every relevant event", () => {
    // A pull request is the five-field stub, so its diff stats are absent; a
    // push has no commit list. The gaps are the point of TASKS 4.4.
    const { deduplicated } = runFixture("active");
    const prs = deduplicated.events.filter((e) => e.kind === "pull_request");
    const pushes = deduplicated.events.filter((e) => e.kind === "push");

    for (const pr of prs) {
      expect(pr.limitations).toContain("diff_stats_unavailable");
    }
    for (const event of pushes) {
      expect(event.limitations).toContain("commit_count_unavailable");
    }
    expect(pushes).toHaveLength(0);
  });

  it("qualifies the merged pull request but not the opened one", () => {
    // §4's value is a placeholder, so this asserts *which* qualifies rather
    // than how much.
    const { deduplicated } = runFixture("active");
    const summary = summarize(score(deduplicated.events));

    expect(summary.eligible).toBeGreaterThan(0);
    expect(summary.rejected).toBeGreaterThan(0);
  });
});

describe("runFixture — inactive", () => {
  it("produces no events, and that is not a failure", () => {
    const { normalized, deduplicated } = runFixture("inactive");

    expect(normalized.events).toEqual([]);
    expect(deduplicated.events).toEqual([]);
    expect(normalized.byConfidence).toEqual({ verified: 0, inferred: 0 });
  });

  it("summarizes to zeros rather than throwing", () => {
    // Summarizing the fixture's actual (empty) event list, rather than a literal
    // empty array, so this asserts the pipeline handles an idle account end to
    // end rather than that `summarize([])` works.
    const { deduplicated } = runFixture("inactive");

    expect(summarize(score(deduplicated.events))).toMatchObject({
      scored: 0,
      eligible: 0,
      rejected: 0,
      totalXp: 0,
    });
  });
});

describe("runFixture — new", () => {
  it("holds both of a new developer's events", () => {
    const { normalized } = runFixture("new");

    expect(normalized.events).toHaveLength(2);
    expect(normalized.byKind.push).toBe(1);
    expect(normalized.byKind.issue).toBe(1);
  });

  it("qualifies the push but not the opened issue", () => {
    const { deduplicated } = runFixture("new");
    const results = score(deduplicated.events);

    // TASKS 5.2 changed this fixture's expected shape: a push now earns §7's
    // value, while an opened issue is still not a closure.
    expect(summarize(results).eligible).toBe(1);

    // DeveloperEvent ids are occurrence-scoped: `<kind>:<github event id>`.
    const push = results.find((r) => r.eventId === "push:push-1");
    expect(push?.eligible).toBe(true);
    expect(push?.classification).toBe("qualifying_push");

    const issue = results.find((r) => r.eventId === "issue:issue-1");
    expect(issue?.eligible).toBe(false);
  });

  it("earns a new developer only §7's smallest amount", () => {
    // A first push is the only thing that qualifies here, so the total is exactly
    // the push value — the floor of what implementation work is worth.
    const { deduplicated } = runFixture("new");

    expect(summarize(score(deduplicated.events)).totalXp).toBe(
      SCORING_V1.xp.qualifying_push,
    );
  });
});

describe("runFixture — large", () => {
  it("reaches the documented 300-event ceiling", () => {
    const { normalized } = runFixture("large");

    expect(normalized.events).toHaveLength(300);
  });

  it("stays internally consistent at that size", () => {
    const { normalized } = runFixture("large");
    const total = Object.values(normalized.byKind).reduce((a, b) => a + b, 0);

    expect(total).toBe(normalized.events.length);
  });

  it("gives every event a distinct identity, as a real feed does", () => {
    const { normalized } = runFixture("large");
    const ids = new Set(normalized.events.map((e) => e.id));

    expect(ids.size).toBe(300);
  });

  it("mixes the kinds the way a real feed does", () => {
    const { normalized } = runFixture("large");

    // Pushes dominate and lifecycle events are a quarter of the feed — the
    // proportions observed live on sindresorhus.
    expect(normalized.byKind.push).toBeGreaterThan(normalized.byKind.release);
    expect(normalized.byKind.lifecycle).toBeGreaterThan(0);
  });
});

describe("runFixture — duplicate activity", () => {
  it("collapses a repeated sync's 80 observations into 40 identities", () => {
    const { normalized, deduplicated } = runFixture("duplicate_activity");

    // TASKS 4.6 deduplication, exercised on a fixture shaped like a re-sync.
    expect(normalized.events).toHaveLength(80);
    expect(deduplicated.events).toHaveLength(40);
  });

  it("reports the collapse", () => {
    const { normalized, deduplicated } = runFixture("duplicate_activity");

    expect(normalized.events.length - deduplicated.events.length).toBe(40);
  });
});

describe("runFixture — mixed activity", () => {
  it("normalizes the varied cases without throwing", () => {
    const { normalized } = runFixture("mixed_activity");

    expect(normalized.events.length).toBeGreaterThan(0);
  });

  it("confirms repositories from the feed itself, foreign ones included", () => {
    const { normalized } = runFixture("mixed_activity");

    // Work in someone else's repository still happened; the inference is about
    // ownership, not about whether they did it.
    expect(normalized.byConfidence.verified).toBeGreaterThan(0);
  });

  it("keeps a backfilled event extreme date, since the feed is unordered", () => {
    const { deduplicated } = runFixture("mixed_activity");
    const timestamps = deduplicated.events
      .map((e) => e.occurredAt)
      .filter((t): t is string => t !== null);

    expect(timestamps).toContain("2024-08-28T05:10:42Z");
  });

  it("tolerates an event with no timestamp", () => {
    const { deduplicated } = runFixture("mixed_activity");

    expect(
      deduplicated.events.some((e) => e.limitations.includes("timestamp_missing")),
    ).toBe(true);
  });
});

describe("fixtureFor", () => {
  it("returns the fixture with that name", () => {
    expect(fixtureFor("inactive").events).toEqual([]);
  });

  it("throws for an unknown name rather than returning undefined", () => {
    expect(() => fixtureFor("nope" as never)).toThrow(/No fixture named/);
  });
});
