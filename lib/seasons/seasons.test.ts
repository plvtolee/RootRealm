import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";

import {
  countedActivity,
  publishedSafeguards,
  runSafeguards,
  SAFEGUARDS_V1,
  UNATTRIBUTED_REPOSITORY,
} from "./antifarm";
import {
  historicalSeasons,
  pointsFor,
  seasonAt,
  seasonById,
  seasonCatalogProblems,
  SEASONS,
} from "./definition";
import {
  eligibilityFor,
  evidenceCheck,
  publishedRules,
} from "./eligibility";
import {
  optInToSeason,
  participationFor,
  participatingDevelopers,
  withdrawFromSeason,
} from "./optin";
import { pointsForSeasonEvent, rankStandingAt, rankStandings, snapshotOf } from "./rank";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const AT = new Date("2026-05-15T12:00:00.000Z");
/** The season containing `AT`, so the tests follow the catalog's active window. */
const IN_SEASON = seasonAt(SEASONS, AT)!;

/** Loose overrides, so a fixture can vary the evidence a merge carries. */
type EventOverride = {
  id?: string;
  occurredAt?: string | null;
  repositoryId?: number | null;
  evidence?: Record<string, unknown>;
};

function merged(over: EventOverride = {}): DeveloperEvent {
  return {
    id: "merge-1",
    kind: "pull_request",
    developerLogin: "octocat",
    developerId: 1,
    repositoryId: 10,
    repositoryFullName: "octocat/hello",
    occurredAt: "2026-05-01T10:00:00.000Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: null,
    relevance: "scored",
    limitations: [],
    evidence: { merged: true, action: "merged" },
    ...over,
  } as unknown as DeveloperEvent;
}

function released(over: Partial<DeveloperEvent> = {}): DeveloperEvent {
  return {
    id: "release-1",
    kind: "release",
    developerLogin: "octocat",
    developerId: 1,
    repositoryId: 11,
    repositoryFullName: "octocat/other",
    occurredAt: "2026-05-03T10:00:00.000Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: null,
    relevance: "scored",
    limitations: [],
    evidence: { action: "published", draft: false },
    ...over,
  } as unknown as DeveloperEvent;
}

/* -------------------------------------------------------------------------- */
/* 16.1 — the season model                                                     */
/* -------------------------------------------------------------------------- */

describe("season model (16.1)", () => {
  it("has no catalog problems", () => {
    expect(seasonCatalogProblems(SEASONS)).toEqual([]);
  });

  it("has a season at a moment inside it", () => {
    expect(seasonAt(SEASONS, AT)?.id).toBe("season-2");
  });

  it("has no season between seasons, rather than inventing one", () => {
    // After every published window ends: a gap is a real answer of null.
    const gap = new Date("2027-01-01T00:00:00.000Z");

    expect(seasonAt(SEASONS, gap)).toBeNull();
  });

  it("treats the boundary instant as the next season, never both", () => {
    const boundary = new Date(IN_SEASON.startsAt);

    expect(seasonAt(SEASONS, boundary)?.id).toBe("season-2");
    expect(seasonAt(SEASONS, new Date(IN_SEASON.endsAt))?.id).not.toBe("season-2");
  });

  it("lists historical seasons newest first", () => {
    const later = new Date("2026-11-01T00:00:00.000Z");

    expect(historicalSeasons(SEASONS, later).map((s) => s.id)).toEqual(["season-2", "season-1"]);
  });

  it("keeps a closed season's rules as they were", () => {
    // A finished season is a record, so its published numbers are not edited to
    // match the current season's.
    expect(seasonById(SEASONS, "season-1")?.points.merged_pull_requests).toBe(10);
  });

  it("awards nothing outside a season", () => {
    expect(pointsFor(null, "merged_pull_requests")).toBe(0);
  });

  it("names an overlapping pair, which would make 'this season' ambiguous", () => {
    const overlapping = [
      ...SEASONS,
      { ...SEASONS[1], id: "season-3" },
    ];

    expect(seasonCatalogProblems(overlapping)).toContain('Seasons "season-2" and "season-3" overlap.');
  });

  it("names a season that ends before it starts", () => {
    const broken = [{ ...IN_SEASON, id: "season-x", endsAt: IN_SEASON.startsAt }];

    expect(seasonCatalogProblems(broken)).toContain('Season "season-x" does not end after it starts.');
  });

  it("names a negative or fractional point value", () => {
    const broken = [{ ...IN_SEASON, id: "season-x", points: { merged_pull_requests: -5 } }];

    expect(seasonCatalogProblems(broken)).toContain(
      'Season "season-x" gives merged_pull_requests a non-positive value.',
    );
  });

  it("refuses a season that does not require opt-in", () => {
    const broken = [
      {
        ...IN_SEASON,
        id: "season-x",
        eligibility: { ...IN_SEASON.eligibility, requiresOptIn: false },
      },
    ];

    expect(seasonCatalogProblems(broken)).toContain('Season "season-x" does not require opt-in.');
  });
});

/* -------------------------------------------------------------------------- */
/* 16.3 — rank points                                                          */
/* -------------------------------------------------------------------------- */

describe("rank points (16.3)", () => {
  it("exposes the same per-event points used by safeguards", () => {
    expect(pointsForSeasonEvent(merged(), IN_SEASON)).toBe(10);
    expect(pointsForSeasonEvent(released(), IN_SEASON)).toBe(25);
    expect(pointsForSeasonEvent({
      ...merged(),
      id: "push-1",
      kind: "push",
      evidence: { branch: "main", headSha: "head", beforeSha: "before" },
    } as unknown as DeveloperEvent, IN_SEASON)).toBe(0);
  });

  it("scores a season's activity", () => {
    const standing = rankStandingAt({
      developerLogin: "octocat",
      events: [merged(), released()],
      at: AT,
      seasons: SEASONS,
    });

    // 1 merge × 10 + 1 release × 25.
    expect(standing).toMatchObject({ seasonId: "season-2", rankPoints: 35 });
    expect(standing?.breakdown).toEqual({ merged_pull_requests: 1, published_releases: 1 });
  });

  it("ignores activity outside the season's window", () => {
    const standing = rankStandingAt({
      developerLogin: "octocat",
      events: [merged({ occurredAt: "2026-01-05T10:00:00.000Z" })],
      at: AT,
      seasons: SEASONS,
    });

    expect(standing).toMatchObject({ rankPoints: 0, eventsInSeason: 0 });
  });

  it("has no standing at all outside a season", () => {
    const standing = rankStandingAt({
      developerLogin: "octocat",
      events: [merged()],
      at: new Date("2027-01-01T00:00:00.000Z"),
      seasons: SEASONS,
    });

    // Null, not zero: "no season" and "in a season with nothing" are different
    // facts about a developer.
    expect(standing).toBeNull();
  });

  it("keeps rank points out of the XP shape entirely", () => {
    const standing = rankStandingAt({
      developerLogin: "octocat",
      events: [merged()],
      at: AT,
      seasons: SEASONS,
    });

    expect(Object.keys(standing!).sort()).toEqual([
      "breakdown",
      "computedAt",
      "developerLogin",
      "eventsInSeason",
      "rankPoints",
      "seasonId",
    ]);
  });

  it("does not accumulate: the same events give the same standing", () => {
    const events = [merged(), released()];
    const input = { developerLogin: "octocat", events, at: AT, seasons: SEASONS };

    expect(rankStandingAt(input)).toEqual(rankStandingAt(input));
  });

  it("counts a repeated observation of one event once", () => {
    const events = [merged(), merged()];
    const standing = rankStandingAt({ developerLogin: "octocat", events, at: AT, seasons: SEASONS });

    expect(standing?.breakdown).toEqual({ merged_pull_requests: 1 });
  });

  it("orders a ladder by points, then by login, so a read is reproducible", () => {
    const entries = [
      { developerLogin: "zoe", rankPoints: 10, seasonId: "season-2", breakdown: {}, eventsInSeason: 1, computedAt: AT.toISOString() },
      { developerLogin: "amy", rankPoints: 30, seasonId: "season-2", breakdown: {}, eventsInSeason: 3, computedAt: AT.toISOString() },
      { developerLogin: "bob", rankPoints: 10, seasonId: "season-2", breakdown: {}, eventsInSeason: 1, computedAt: AT.toISOString() },
    ];

    expect(rankStandings(entries).map((entry) => entry.standing.developerLogin)).toEqual([
      "amy",
      "bob",
      "zoe",
    ]);
    expect(rankStandings(entries).map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it("snapshots one season without the others", () => {
    const other = { ...rankStandings([])[0], standing: {} };
    void other;

    const snapshot = snapshotOf("season-2", [
      {
        seasonId: "season-2",
        developerLogin: "octocat",
        rankPoints: 10,
        breakdown: {},
        eventsInSeason: 1,
        computedAt: AT.toISOString(),
      },
      {
        seasonId: "season-1",
        developerLogin: "amy",
        rankPoints: 99,
        breakdown: {},
        eventsInSeason: 9,
        computedAt: AT.toISOString(),
      },
    ], AT);

    expect(snapshot.entries.map((entry) => entry.standing.developerLogin)).toEqual(["octocat"]);
    expect(snapshot.computedAt).toBe(AT.toISOString());
  });
});

/* -------------------------------------------------------------------------- */
/* 16.2 — opt-in                                                               */
/* -------------------------------------------------------------------------- */

describe("leaderboard opt-in (16.2)", () => {
  const join = (login: string, at = "2026-04-02T00:00:00.000Z") =>
    optInToSeason([], { season: IN_SEASON, developerLogin: login, recordedAt: at });

  it("treats absence of a record as non-participation", () => {
    expect(participationFor([], IN_SEASON, "octocat")).toEqual({
      participating: false,
      refusal: "no_consent",
    });
  });

  it("participates once consent is given", () => {
    const records = join("octocat");

    expect(participationFor(records, IN_SEASON, "octocat")).toMatchObject({ participating: true });
  });

  it("does not carry consent into another season", () => {
    const records = join("octocat");

    expect(participationFor(records, SEASONS[0], "octocat").participating).toBe(false);
  });

  it("records withdrawal rather than deleting the choice", () => {
    const records = withdrawFromSeason(join("octocat"), {
      season: IN_SEASON,
      developerLogin: "octocat",
      recordedAt: "2026-05-01T00:00:00.000Z",
    });

    expect(participationFor(records, IN_SEASON, "octocat")).toEqual({
      participating: false,
      refusal: "withdrawn",
    });
    expect(records).toHaveLength(1);
  });

  it("records a re-join as one record, not two", () => {
    const records = optInToSeason(join("octocat"), {
      season: IN_SEASON,
      developerLogin: "octocat",
      recordedAt: "2026-05-02T00:00:00.000Z",
    });

    expect(records).toHaveLength(1);
  });

  it("filters a set of developers to the participants", () => {
    const records = join("octocat");

    expect(participatingDevelopers(records, IN_SEASON, ["octocat", "amy"])).toEqual(["octocat"]);
  });
});

/* -------------------------------------------------------------------------- */
/* 16.4 — eligibility                                                          */
/* -------------------------------------------------------------------------- */

describe("leaderboard eligibility (16.4)", () => {
  const five = (over: EventOverride = {}) =>
    Array.from({ length: 5 }, (_unused, index) => merged({ id: `merge-${index}`, ...over }));

  it("publishes its rules", () => {
    expect(publishedRules(IN_SEASON)).toEqual({
      seasonId: "season-2",
      seasonName: "Second Season",
      minimumEvidence: "5 qualifying merged pull requests",
      requiresOptIn: true,
      points: [
        { kind: "merged_pull_requests", points: 10 },
        { kind: "published_releases", points: 25 },
        { kind: "completed_reviews", points: 15 },
        { kind: "qualifying_documentation", points: 5 },
      ],
    });
  });

  it("counts the season's evidence minimum", () => {
    expect(evidenceCheck(IN_SEASON, five())).toEqual({ required: 5, counted: 5, met: true });
  });

  it("is eligible with consent, evidence and safeguards", () => {
    const outcome = eligibilityFor({
      season: IN_SEASON,
      developerLogin: "octocat",
      events: five(),
      participating: true,
      safeguardsPass: true,
    });

    expect(outcome.eligible).toBe(true);
  });

  it("refuses a developer who did not opt in", () => {
    const outcome = eligibilityFor({
      season: IN_SEASON,
      developerLogin: "octocat",
      events: five(),
      participating: false,
      safeguardsPass: true,
    });

    expect(outcome).toMatchObject({ eligible: false, ineligibility: { reason: "no_consent" } });
  });

  it("names the shortfall when the evidence minimum is not met", () => {
    const outcome = eligibilityFor({
      season: IN_SEASON,
      developerLogin: "octocat",
      events: five({ id: "only-two" }).slice(0, 2),
      participating: true,
      safeguardsPass: true,
    });

    expect(outcome).toMatchObject({
      eligible: false,
      ineligibility: { reason: "evidence_minimum_not_met", required: 5, counted: 2 },
    });
  });

  it("refuses a standing a safeguard rejected", () => {
    const outcome = eligibilityFor({
      season: IN_SEASON,
      developerLogin: "octocat",
      events: five(),
      participating: true,
      safeguardsPass: false,
    });

    expect(outcome).toMatchObject({ eligible: false, ineligibility: { reason: "safeguard_failed" } });
  });
});

/* -------------------------------------------------------------------------- */
/* 16.5 — safeguards                                                           */
/* -------------------------------------------------------------------------- */

describe("anti-farming safeguards (16.5)", () => {
  const pointFor = (event: DeveloperEvent) =>
    event.kind === "pull_request" && event.evidence.merged ? 10 : 0;

  it("counts only season activity, once per event", () => {
    const activity = countedActivity(
      [
        merged(),
        merged(),
        merged({ occurredAt: "2026-01-05T10:00:00.000Z" }),
        merged({
          id: "draft",
          evidence: { merged: false, action: "opened" },
        }),
      ],
      IN_SEASON,
      pointFor,
    );

    expect(activity.map((entry) => entry.eventId)).toEqual(["merge-1"]);
  });

  it("passes activity spread over several days and repositories", () => {
    const activity = countedActivity(
      [
        merged({ id: "a", occurredAt: "2026-05-01T10:00:00.000Z", repositoryId: 1 }),
        merged({ id: "b", occurredAt: "2026-05-02T10:00:00.000Z", repositoryId: 2 }),
        merged({ id: "c", occurredAt: "2026-05-03T10:00:00.000Z", repositoryId: 3 }),
      ],
      IN_SEASON,
      pointFor,
    );

    expect(runSafeguards(activity, AT).passed).toBe(true);
  });

  it("rejects a burst: one day of activity cannot take a season", () => {
    const activity = countedActivity(
      Array.from({ length: 5 }, (_unused, index) =>
        merged({ id: `burst-${index}`, occurredAt: "2026-05-01T10:00:00.000Z" }),
      ),
      IN_SEASON,
      pointFor,
    );

    const verdict = runSafeguards(activity, AT);
    expect(verdict.passed).toBe(false);
    expect(verdict.checks.find((check) => check.rule === "burst_activity")).toMatchObject({
      passed: false,
      detail: expect.stringContaining("3 required"),
    });
  });

  it("rejects a standing resting on one repository", () => {
    const activity = countedActivity(
      [
        merged({ id: "a", occurredAt: "2026-05-01T10:00:00.000Z", repositoryId: 7 }),
        merged({ id: "b", occurredAt: "2026-05-02T10:00:00.000Z", repositoryId: 7 }),
        merged({ id: "c", occurredAt: "2026-05-03T10:00:00.000Z", repositoryId: 8 }),
      ],
      IN_SEASON,
      pointFor,
    );

    const verdict = runSafeguards(activity, AT);
    expect(verdict.checks.find((check) => check.rule === "single_repository")?.passed).toBe(false);
  });

  it("does not trip on a developer who works in one repository across many days", () => {
    const activity = countedActivity(
      ["01", "02", "03", "04"].map((day) =>
        merged({ id: `single-${day}`, occurredAt: `2026-05-${day}T10:00:00.000Z`, repositoryId: 7 }),
      ),
      IN_SEASON,
      pointFor,
    );

    // The ceiling is 60%, so a single repository at 100% does trip. What must not
    // trip is the burst rule, and it does not.
    const verdict = runSafeguards(activity, AT);
    expect(verdict.checks.find((check) => check.rule === "burst_activity")?.passed).toBe(true);
    expect(verdict.checks.find((check) => check.rule === "single_repository")?.passed).toBe(false);
  });

  it("rejects activity dated after the standing was computed", () => {
    const activity = countedActivity(
      [
        merged({ id: "a", occurredAt: "2026-05-01T10:00:00.000Z" }),
        merged({ id: "b", occurredAt: "2026-05-02T10:00:00.000Z" }),
        merged({ id: "c", occurredAt: "2026-05-03T10:00:00.000Z" }),
        merged({ id: "d", occurredAt: "2026-05-04T10:00:00.000Z" }),
      ],
      IN_SEASON,
      pointFor,
    );

    const earlier = new Date("2026-05-03T00:00:00.000Z");
    expect(runSafeguards(activity, earlier).checks.find((c) => c.rule === "future_dated")?.passed).toBe(
      false,
    );
  });

  it("reports every check, not only the first failure", () => {
    const activity = countedActivity(
      [merged({ id: "a", occurredAt: "2026-05-01T10:00:00.000Z" })],
      IN_SEASON,
      pointFor,
    );

    expect(runSafeguards(activity, AT).checks).toHaveLength(4);
  });

  it("publishes its rules so a developer can read them before competing", () => {
    const published = publishedSafeguards();

    expect(published.id).toBe(SAFEGUARDS_V1.id);
    expect(published.statements).toHaveLength(4);
    expect(published.statements[0]).toContain("at least 3 different UTC days");
  });

  it("buckets unattributable activity rather than dropping it", () => {
    const activity = countedActivity(
      [merged({ id: "a", repositoryId: null })],
      IN_SEASON,
      pointFor,
    );

    expect(activity[0].repositoryId).toBe(UNATTRIBUTED_REPOSITORY);
  });
});
