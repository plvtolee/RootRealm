/**
 * RootRealm — rank points (TASKS 16.3).
 *
 * ```text
 * a developer's events inside one season → that season's rank points
 * ```
 *
 * SCORING.md §30: "Rank Points are separate from XP, attributes, CodeCoins" and
 * "A high permanent XP total does not automatically define seasonal rank". Both
 * clauses are about *separation*, and this module is how that is enforced rather
 * than merely intended:
 *
 * - the input is a **season**, so points cannot be computed without one;
 * - the output is a new type, so rank points cannot be added to an XP balance by
 *   accident even where both are in scope;
 * - the two never share a key. XP is `xp:<login>:<eventId>:<version>`; a rank
 *   snapshot is keyed by `(seasonId, login, computedAt)`. A re-score under a new
 *   scoring version produces new XP and *no* new standing, because a standing is
 *   about the season, not about the version.
 *
 * ## Why points are recomputed rather than accumulated
 *
 * A standing is computed from the events *in the season's window*. Accumulating
 * per-event points instead would make the total depend on when the ledger happened
 * to be read, and would let a re-ingested event be counted twice — the exact
 * double-count TASKS 11.3 is about. Recomputing from deduplicated evidence has the
 * useful property that it cannot drift: the same events and the same season give
 * the same standing, whatever ran before.
 */
import type { DeveloperEvent } from "../developer-event";

import { seasonAt, type Season } from "./definition";

/** A developer's standing in a season, at a moment. */
export interface RankStanding {
  readonly seasonId: string;
  /** The developer's GitHub login. */
  readonly developerLogin: string;
  /** Season points only. Never XP, never CodeCoins. */
  readonly rankPoints: number;
  /** The count per requirement kind that produced them, for explanation. */
  readonly breakdown: Readonly<Record<string, number>>;
  /** How many of the developer's events the season's window contained. */
  readonly eventsInSeason: number;
  /** ISO-8601, the moment this standing describes. */
  readonly computedAt: string;
}

/**
 * The countable kind an event belongs to, or null when it is not countable.
 *
 * The same kinds the season's point table names, so a standing and the safeguards
 * that judge it (16.5) cannot disagree about what counted.
 */
function kindFor(event: DeveloperEvent): string | null {
  if (event.kind === "pull_request" && event.evidence?.merged === true) {
    return "merged_pull_requests";
  }
  if (event.kind === "review" && event.evidence?.state === "approved") {
    return "completed_reviews";
  }
  if (event.kind === "release" && event.evidence?.action === "published" && event.evidence?.draft !== true) {
    return "published_releases";
  }
  if (event.kind === "documentation" && (event.evidence?.pagesCreated ?? 0) > 0) {
    return "qualifying_documentation";
  }
  return null;
}

/**
 * The events inside a season's window, deduplicated by event id.
 *
 * Deduplicated here, not left to the caller, because a standing that counted a
 * repeated observation twice would disagree with the safeguards that judge it
 * (TASKS 16.5) — and with the XP ledger, which keys on the event id for exactly
 * this reason (SCORING.md §18).
 */
function eventsInsideSeason(
  events: readonly DeveloperEvent[],
  season: Season,
): readonly DeveloperEvent[] {
  const starts = Date.parse(season.startsAt);
  const ends = Date.parse(season.endsAt);
  const seen = new Set<string>();
  const inside: DeveloperEvent[] = [];

  for (const event of events) {
    if (seen.has(event.id)) continue;

    const occurred = event.occurredAt === null ? NaN : Date.parse(event.occurredAt);
    if (Number.isNaN(occurred)) continue;
    if (occurred < starts || occurred >= ends) continue;

    seen.add(event.id);
    inside.push(event);
  }

  return inside;
}

/**
 * A developer's rank points in the season containing `at`.
 *
 * Returns null when no season contains the moment: there is no season, so there
 * is no standing — rather than zero points, which would read as "ranked last".
 * The distinction matters, because "not in a season" and "in a season with no
 * points" are different facts about a developer.
 */
export function rankStandingAt(input: {
  readonly developerLogin: string;
  readonly events: readonly DeveloperEvent[];
  readonly at: Date;
  readonly seasons: readonly Season[];
  /** Overrides the season the developer is standing in. */
  readonly season?: Season | null;
}): RankStanding | null {
  const season = input.season !== undefined ? input.season : seasonAt(input.seasons, input.at);
  if (season === null || season === undefined) return null;

  // A season may cover only part of a developer's history, so the window is
  // applied first and the points are counted over what is inside it.
  const inSeason = eventsInsideSeason(input.events, season);

  const counts = new Map<string, number>();
  for (const event of inSeason) {
    const kind = kindFor(event);
    if (kind === null) continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const breakdown: Record<string, number> = {};
  let rankPoints = 0;

  for (const [kind, count] of counts) {
    const unit = season.points[kind];
    if (unit === undefined) continue;
    breakdown[kind] = count;
    rankPoints += unit * count;
  }

  return {
    seasonId: season.id,
    developerLogin: input.developerLogin,
    rankPoints,
    breakdown,
    eventsInSeason: inSeason.length,
    computedAt: input.at.toISOString(),
  };
}

/**
 * The ranks for one season, best first.
 *
 * Ties are ordered by login, not left to sort stability: two developers on the
 * same points must get the same rank whichever order the input arrived in, or the
 * same ladder would differ between two reads of the same data.
 */
export function rankStandings(standings: readonly RankStanding[]): readonly RankedStanding[] {
  return [...standings]
    .sort((a, b) => b.rankPoints - a.rankPoints || (a.developerLogin < b.developerLogin ? -1 : 1))
    .map((standing, index) => ({ standing, rank: index + 1 }));
}

/** One place on the ladder. */
export interface RankedStanding {
  readonly standing: RankStanding;
  /** 1-based. Shared by ties, in the order they appear. */
  readonly rank: number;
}

/**
 * A snapshot of the ladder, as `rank_snapshots` records it (TASKS 10.5).
 *
 * Immutable by construction: it is built once from a set of standings and carries
 * the moment it describes, so appending a later standing produces a second
 * snapshot rather than editing the first.
 */
export interface RankSnapshot {
  readonly seasonId: string;
  readonly computedAt: string;
  readonly entries: readonly RankedStanding[];
}

export function snapshotOf(
  seasonId: string,
  standings: readonly RankStanding[],
  at: Date,
): RankSnapshot {
  const entries = rankStandings(standings.filter((s) => s.seasonId === seasonId));
  return { seasonId, computedAt: at.toISOString(), entries };
}

/**
 * Whether an event counts toward a season's points.
 *
 * Exposed so eligibility (16.4) and anti-farming (16.5) can ask the same question
 * the scoring does, rather than each keeping its own idea of what counts.
 */
export function eventCountsForSeason(event: DeveloperEvent, season: Season): boolean {
  const kind = kindFor(event);
  return kind !== null && season.points[kind] !== undefined;
}

/** The season points contributed by one event, or zero when it is not countable. */
export function pointsForSeasonEvent(event: DeveloperEvent, season: Season): number {
  const kind = kindFor(event);
  return kind === null ? 0 : season.points[kind] ?? 0;
}
