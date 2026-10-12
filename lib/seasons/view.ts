/**
 * RootRealm — the leaderboard screen's view model (TASKS 16.6).
 *
 * ```text
 * season + standings + consent + one developer's evidence → what the screen shows
 * ```
 *
 * The screen shows two things that are easy to confuse and must not be: **the
 * published rules of the season**, and **where one developer stands**. They are
 * separate view models here, because a reader looking at a ladder needs the rules
 * that produced it in the same view — and a developer who is not on the ladder
 * still needs to read them.
 *
 * ## Why a developer's own standing is shown even when unranked
 *
 * An empty ladder with no explanation reads as a broken feature. A developer who
 * is not eligible gets the specific reason and the numbers behind it (16.4),
 * which is the difference between "you are not on the ladder" and "you need 3
 * more qualifying merges, and here is where you stand".
 *
 * ## Why the ladder can legitimately be empty
 *
 * A season nobody has opted into has no standings, and a standing withheld by a
 * safeguard (16.5) is not published at all. Both are empty states with a reason,
 * not gaps to be filled with sample developers.
 */
import { publishedSafeguards, type PublishedSafeguards } from "./antifarm";
import type { Season } from "./definition";
import { eligibilityFor, publishedRules, type Eligibility } from "./eligibility";
import { participationFor, type Participation, type SeasonConsent } from "./optin";
import { rankStandingAt, rankStandings, type RankedStanding, type RankStanding } from "./rank";
import type { DeveloperEvent } from "../developer-event";

/** One published place on the ladder. */
export interface LadderRow {
  readonly rank: number;
  readonly developerLogin: string;
  readonly rankPoints: number;
  /** The count per kind behind the points, for the explanation column. */
  readonly breakdown: Readonly<Record<string, number>>;
}

/** Where one developer stands, published or not. */
export interface ViewedStanding {
  readonly eligibility: Eligibility;
  /** The standing that would be published, or null when not eligible. */
  readonly standing: RankStanding | null;
  readonly participation: Participation;
  /** How many of the season's evidence events were counted. */
  readonly eventsInSeason: number;
}

/** The whole leaderboard screen's state. */
export interface LeaderboardViewState {
  readonly season: Season;
  readonly rules: ReturnType<typeof publishedRules>;
  readonly safeguards: PublishedSafeguards;
  /** Published standings, best first. Empty is a legitimate state. */
  readonly ladder: readonly LadderRow[];
  readonly viewer: ViewedStanding | null;
  /**
   * How long the season has left, computed server-side.
   *
   * Passed rather than derived in the component: a client rendering "Ends in 12
   * days" from its own clock would disagree with the server's render by however
   * long the response took, which is a hydration mismatch for a countdown nobody
   * asked to be precise about.
   */
  readonly windowLabel: string;
  /** When this view was computed, ISO-8601. */
  readonly computedAt: string;
}

/**
 * Derives the leaderboard screen's state.
 *
 * `viewerLogin` is null for a developer who is not signed in, and the viewer
 * block is then null rather than a standing of zero: "not identified" and
 * "identified with nothing" are different facts.
 *
 * Standings passed in are filtered through consent before they are published —
 * the ladder cannot leak a developer who opted out, whichever caller assembled it.
 */
export function computeLeaderboardView(input: {
  readonly season: Season;
  readonly standings: readonly RankStanding[];
  readonly consents: readonly SeasonConsent[];
  readonly at: Date;
  readonly viewerLogin?: string | null;
  readonly viewerEvents?: readonly DeveloperEvent[];
  readonly safeguardsPass?: boolean;
}): LeaderboardViewState {
  const published = input.standings.filter((standing) =>
    participationFor(input.consents, input.season, standing.developerLogin).participating,
  );

  const ladder: LadderRow[] = rankStandings(published).map((entry: RankedStanding) => ({
    rank: entry.rank,
    developerLogin: entry.standing.developerLogin,
    rankPoints: entry.standing.rankPoints,
    breakdown: entry.standing.breakdown,
  }));

  let viewer: ViewedStanding | null = null;
  if (input.viewerLogin !== undefined && input.viewerLogin !== null) {
    const participation = participationFor(input.consents, input.season, input.viewerLogin);
    const standing = rankStandingAt({
      developerLogin: input.viewerLogin,
      events: input.viewerEvents ?? [],
      at: input.at,
      seasons: [input.season],
      season: input.season,
    });
    const eligibility = eligibilityFor({
      season: input.season,
      developerLogin: input.viewerLogin,
      events: input.viewerEvents ?? [],
      participating: participation.participating,
      safeguardsPass: input.safeguardsPass ?? true,
    });

    viewer = {
      eligibility,
      standing: eligibility.eligible ? standing : null,
      participation,
      eventsInSeason: standing?.eventsInSeason ?? 0,
    };
  }

  return {
    season: input.season,
    rules: publishedRules(input.season),
    safeguards: publishedSafeguards(),
    ladder,
    viewer,
    windowLabel: seasonWindowLabel(input.season, input.at),
    computedAt: input.at.toISOString(),
  };
}

/** How long a season has left, as a sentence the screen can show. */
export function seasonWindowLabel(season: Season, at: Date): string {
  const ends = Date.parse(season.endsAt);
  const days = Math.floor((ends - at.getTime()) / 86_400_000);

  if (days <= 0) return "Season closed";
  if (days === 1) return "Ends tomorrow";
  return `Ends in ${days} days`;
}

/** The points a season awards, as one line. */
export function seasonPointsLabel(season: Season): string {
  return Object.entries(season.points)
    .map(([kind, points]) => `${points} ${KIND_LABEL[kind] ?? kind}`)
    .join(" · ");
}

const KIND_LABEL: Readonly<Record<string, string>> = {
  merged_pull_requests: "per merge",
  published_releases: "per release",
  completed_reviews: "per review",
  qualifying_documentation: "per doc",
};