/**
 * RootRealm — the season model (TASKS 16.1).
 *
 * ```text
 * a season = a named window with published rules, active or historical
 * ```
 *
 * TASKS 16.1 asks for "active and historical seasons". A season is therefore not a
 * flag but a *window*: `startsAt`/`endsAt` decide which one is active at any
 * moment, and the two states fall out of that comparison rather than being stored.
 * A `status` column that had to be maintained would eventually disagree with the
 * dates it is supposed to describe.
 *
 * ## Why the rules are published with the season
 *
 * SCORING.md §30 requires a ranking system to be "transparent", and transparency
 * about a season nobody can see until it ends is not transparency. So the rules
 * travel with the season: the point table, the eligibility requirements, and the
 * anti-farming safeguards are part of the season's published record, not
 * configuration that could change while the season runs.
 *
 * ## Why a snapshot is immutable
 *
 * A standing is a statement about a moment. If it could be updated in place, a
 * ladder could be rewritten retroactively and there would be no way to tell a
 * result from an edit — the same argument the XP ledger makes (SCORING.md §3).
 * The snapshot type here is the in-memory twin of `rank_snapshots` (TASKS 10.5),
 * which is append-only for the same reason.
 */
import type { EvidenceRequirement } from "../skills/definition";

/** One season's point values for countable activity. */
export type RankPointTable = Readonly<Record<string, number>>;

/** What a season requires of a developer to appear on the ladder. */
export interface SeasonEligibilityRules {
  /**
   * Evidence the developer must have before any standing counts.
   *
   * A minimum observed history, not a quality bar: a season ladder with one push
   * on it says nothing, and an eligibility rule is the only place to say that.
   */
  readonly minimumEvidence: EvidenceRequirement;
  /**
   * Whether a developer must opt in to be ranked (TASKS 16.2).
   *
   * Kept as data rather than assumed, because SCORING.md §30 requires opt-in and
   * a season that encoded "opt-out" would be a different product.
   */
  readonly requiresOptIn: boolean;
  /** Whether private repository activity counts, when authorized. */
  readonly countsAuthorizedPrivateActivity: boolean;
}

/** One season. */
export interface Season {
  /** Stable id. Snapshots reference it, so renaming orphans history. */
  readonly id: string;
  readonly name: string;
  /** ISO-8601. Inclusive. */
  readonly startsAt: string;
  /** ISO-8601. Exclusive. */
  readonly endsAt: string;
  readonly points: RankPointTable;
  readonly eligibility: SeasonEligibilityRules;
}

/**
 * The starting ladder.
 *
 * Two closed seasons and one running, so the model has handled a season ending
 * (twice) rather than only the state in which nothing has happened yet. The
 * closed seasons keep the numbers they finished with: a finished ladder is a
 * record, and the running season's table is a separate object rather than an edit
 * to theirs.
 *
 * The windows are UTC and half-open, matching `periodKeyFor` in the quest rules —
 * a season boundary is a period boundary, and using one rule for both means a
 * reset cannot mean two different things.
 */
export const SEASONS: readonly Season[] = [
  {
    id: "season-1",
    name: "Founding Season",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-04-01T00:00:00.000Z",
    points: {
      merged_pull_requests: 10,
      published_releases: 25,
      completed_reviews: 15,
      qualifying_documentation: 5,
    },
    eligibility: {
      minimumEvidence: { kind: "merged_pull_requests", count: 5 },
      requiresOptIn: true,
      countsAuthorizedPrivateActivity: true,
    },
  },
  {
    id: "season-2",
    name: "Second Season",
    startsAt: "2026-04-01T00:00:00.000Z",
    endsAt: "2026-07-01T00:00:00.000Z",
    points: {
      merged_pull_requests: 10,
      published_releases: 25,
      completed_reviews: 15,
      qualifying_documentation: 5,
    },
    eligibility: {
      minimumEvidence: { kind: "merged_pull_requests", count: 5 },
      requiresOptIn: true,
      countsAuthorizedPrivateActivity: true,
    },
  },
  {
    id: "season-3",
    name: "Third Season",
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-12-01T00:00:00.000Z",
    points: {
      merged_pull_requests: 10,
      published_releases: 25,
      completed_reviews: 15,
      qualifying_documentation: 5,
    },
    eligibility: {
      minimumEvidence: { kind: "merged_pull_requests", count: 5 },
      requiresOptIn: true,
      countsAuthorizedPrivateActivity: true,
    },
  },
];

/**
 * The season a moment falls in, or null when none does.
 *
 * Half-open `[startsAt, endsAt)`, so the instant a season ends is the instant the
 * next one starts and no moment belongs to two seasons. A gap between seasons is
 * a real answer of null: there is a window in which nobody is ranked, and
 * inventing a season to fill it would be a claim about a competition that did not
 * happen.
 */
export function seasonAt(seasons: readonly Season[], at: Date): Season | null {
  const iso = at.toISOString();
  return (
    seasons.find((season) => iso >= season.startsAt && iso < season.endsAt) ?? null
  );
}

/** Seasons that have closed by `at`, newest first. */
export function historicalSeasons(seasons: readonly Season[], at: Date): readonly Season[] {
  const iso = at.toISOString();
  return seasons
    .filter((season) => season.endsAt <= iso)
    .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));
}

/** Looks up a season by id. Returns `undefined` for an unknown id. */
export function seasonById(seasons: readonly Season[], id: string): Season | undefined {
  return seasons.find((season) => season.id === id);
}

/**
 * The points for one season, or 0 outside it.
 *
 * A season that does not exist awards nothing rather than throwing: asking about
 * a closed or unknown season is how a historical view is built, not a bug.
 */
export function pointsFor(season: Season | null, requirementKind: string): number {
  return season?.points[requirementKind] ?? 0;
}

/**
 * The problems in a season catalog, for a test or a startup check.
 *
 * Overlapping windows are the failure that matters: two seasons open at once
 * would make "the current season" ambiguous, and an ambiguous leaderboard is not
 * a leaderboard. Points must also be positive whole numbers — a negative point
 * value would be a penalty, which is not what a ladder is.
 */
export function seasonCatalogProblems(seasons: readonly Season[]): readonly string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const season of seasons) {
    if (seen.has(season.id)) problems.push(`Duplicate season id "${season.id}".`);
    seen.add(season.id);

    if (Date.parse(season.endsAt) <= Date.parse(season.startsAt)) {
      problems.push(`Season "${season.id}" does not end after it starts.`);
    }

    for (const [kind, value] of Object.entries(season.points)) {
      if (!Number.isInteger(value) || value <= 0) {
        problems.push(`Season "${season.id}" gives ${kind} a non-positive value.`);
      }
    }

    if (season.eligibility.requiresOptIn !== true) {
      problems.push(`Season "${season.id}" does not require opt-in.`);
    }
  }

  for (const season of seasons) {
    for (const other of seasons) {
      if (season.id >= other.id) continue;
      const overlaps =
        Date.parse(season.startsAt) < Date.parse(other.endsAt) &&
        Date.parse(other.startsAt) < Date.parse(season.endsAt);
      if (overlaps) {
        problems.push(`Seasons "${season.id}" and "${other.id}" overlap.`);
      }
    }
  }

  return problems;
}