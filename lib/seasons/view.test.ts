import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";

import { SEASONS, seasonAt } from "./definition";
import { optInToSeason, type SeasonConsent } from "./optin";
import { rankStandingAt, type RankStanding } from "./rank";
import { seasonStore } from "./store";
import { createInMemorySeasonStore } from "./store";
import { computeLeaderboardView, seasonPointsLabel, seasonWindowLabel } from "./view";

const AT = new Date("2026-05-15T12:00:00.000Z");
/** The season containing `AT`, so the tests follow the catalog's active window. */
const SEASON = seasonAt(SEASONS, AT)!;

function standing(developerLogin: string, rankPoints: number): RankStanding {
  return {
    seasonId: SEASON.id,
    developerLogin,
    rankPoints,
    breakdown: { merged_pull_requests: rankPoints / 10 },
    eventsInSeason: rankPoints / 10,
    computedAt: AT.toISOString(),
  };
}

function consent(login: string): SeasonConsent {
  return optInToSeason([], {
    season: SEASON,
    developerLogin: login,
    recordedAt: "2026-04-02T00:00:00.000Z",
  })[0];
}

function mergedEvents(count: number): DeveloperEvent[] {
  return Array.from({ length: count }, (_unused, index) =>
    ({
      id: `merge-${index}`,
      kind: "pull_request",
      developerLogin: "octocat",
      developerId: 1,
      repositoryId: 10 + index,
      occurredAt: `2026-05-0${(index % 5) + 1}T10:00:00.000Z`,
      evidence: { merged: true, action: "merged" },
    }) as unknown as DeveloperEvent,
  );
}

describe("leaderboard view (16.6)", () => {
  it("publishes the season's rules above the ladder", () => {
    const view = computeLeaderboardView({
      season: SEASON,
      standings: [],
      consents: [],
      at: AT,
    });

    expect(view.rules).toMatchObject({
      minimumEvidence: "5 qualifying merged pull requests",
      requiresOptIn: true,
    });
    expect(view.safeguards.statements.length).toBeGreaterThan(0);
  });

  it("publishes standings for developers who opted in", () => {
    const view = computeLeaderboardView({
      season: SEASON,
      standings: [standing("amy", 30), standing("bob", 10)],
      consents: [consent("amy"), consent("bob")],
      at: AT,
    });

    expect(view.ladder.map((row) => [row.rank, row.developerLogin, row.rankPoints])).toEqual([
      [1, "amy", 30],
      [2, "bob", 10],
    ]);
  });

  it("never publishes a developer who did not opt in", () => {
    const view = computeLeaderboardView({
      season: SEASON,
      standings: [standing("amy", 30), standing("silent", 99)],
      consents: [consent("amy")],
      at: AT,
    });

    expect(view.ladder.map((row) => row.developerLogin)).toEqual(["amy"]);
  });

  it("has an empty ladder when nobody opted in, and says so rather than inventing rows", () => {
    const view = computeLeaderboardView({
      season: SEASON,
      standings: [standing("silent", 99)],
      consents: [],
      at: AT,
    });

    expect(view.ladder).toEqual([]);
  });

  it("shows a signed-in viewer's own standing", () => {
    const view = computeLeaderboardView({
      season: SEASON,
      standings: [],
      consents: [consent("octocat")],
      at: AT,
      viewerLogin: "octocat",
      viewerEvents: mergedEvents(7),
    });

    expect(view.viewer).toMatchObject({
      eventsInSeason: 7,
      standing: { rankPoints: 70 },
    });
    expect(view.viewer?.eligibility.eligible).toBe(true);
  });

  it("explains why a viewer is not ranked, with the numbers", () => {
    const view = computeLeaderboardView({
      season: SEASON,
      standings: [],
      consents: [consent("octocat")],
      at: AT,
      viewerLogin: "octocat",
      viewerEvents: mergedEvents(2),
    });

    expect(view.viewer?.standing).toBeNull();
    expect(view.viewer?.eligibility).toMatchObject({
      eligible: false,
      ineligibility: { required: 5, counted: 2 },
    });
  });

  it("has no viewer block for an unidentified visitor", () => {
    const view = computeLeaderboardView({ season: SEASON, standings: [], consents: [], at: AT });

    expect(view.viewer).toBeNull();
    expect(view.ladder).toEqual([]);
  });

  it("counts the window server-side, so the client does not re-derive a countdown", () => {
    const view = computeLeaderboardView({ season: SEASON, standings: [], consents: [], at: AT });

    expect(view.windowLabel).toBe("Ends in 46 days");
    expect(view.computedAt).toBe(AT.toISOString());
  });

  it("labels a closed season as closed", () => {
    expect(seasonWindowLabel(SEASON, new Date("2027-01-01T00:00:00.000Z"))).toBe("Season closed");
  });

  it("labels the points in one line", () => {
    expect(seasonPointsLabel(SEASON)).toContain("10 per merge");
  });

  it("agrees with the standing module about a viewer's points", () => {
    // Enough evidence to clear the season's minimum, so the view publishes the
    // standing the rank module computed rather than withholding it.
    const events = mergedEvents(7);
    const direct = rankStandingAt({
      developerLogin: "octocat",
      events,
      at: AT,
      seasons: [SEASON],
      season: SEASON,
    });
    const view = computeLeaderboardView({
      season: SEASON,
      standings: [],
      consents: [consent("octocat")],
      at: AT,
      viewerLogin: "octocat",
      viewerEvents: events,
    });

    expect(view.viewer?.standing?.rankPoints).toBe(direct?.rankPoints);
  });
});

describe("season store (16.6)", () => {
  it("starts empty", async () => {
    const store = createInMemorySeasonStore();

    expect(await store.consents()).toEqual([]);
    expect(await store.standings(SEASON.id)).toEqual([]);
  });

  it("keeps consents and appends standings", async () => {
    const store = createInMemorySeasonStore();

    await store.saveConsents([consent("amy")]);
    await store.publish(standing("amy", 30));

    expect(await store.consents()).toHaveLength(1);
    expect(await store.standings(SEASON.id)).toHaveLength(1);
  });

  it("keeps one season's standings out of another's", async () => {
    const store = createInMemorySeasonStore();

    await store.publish(standing("amy", 30));
    await store.publish({ ...standing("amy", 30), seasonId: "season-1" });

    expect(await store.standings("season-1")).toHaveLength(1);
    expect(await store.standings("season-2")).toHaveLength(1);
  });

  it("appends rather than editing, because a standing is a moment", async () => {
    const store = createInMemorySeasonStore();

    await store.publish(standing("amy", 30));
    await store.publish(standing("amy", 40));

    expect(await store.standings(SEASON.id)).toHaveLength(2);
  });

  it("is the same instance every time, so the page and the route agree", () => {
    expect(seasonStore()).toBe(seasonStore());
  });
});