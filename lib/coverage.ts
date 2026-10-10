/**
 * RootRealm — coverage tracking (TASKS 4.7).
 *
 * ```text
 * every observation → one report of what we actually saw
 * ```
 *
 * TASKS 4.3 and 4.4 each reported partial truth about their own walk. Coverage is
 * where those get assembled into a single statement of what the ingestion run
 * established — and, more importantly, what it did not.
 *
 * ## Why a report rather than more counters
 *
 * Four things are being tracked: repository count, event count, time range and
 * pagination completeness. Tracked separately they are still easy to misuse.
 * GitHub's `public_repos` field says one number while the repository walk stops
 * at a thousand; the activity feed returns 300 events that reach back two days
 * for an active developer, or years if a backfill happens to surface; a walk
 * that stops early looks exactly like an account that simply has no more. Each
 * individual number is truthful. Only the *report* states the boundary.
 *
 * So this module's job is mostly negative: it names what a consumer must not
 * conclude. Every limitation carries its implication, because "103 pushes had no
 * commit list" is a fact nobody can act on, while "commit volume cannot be
 * scored from this run" is a constraint that keeps TASKS 5.2 honest.
 *
 * ## Reconciliation is the acceptance test made runtime-visible
 *
 * A run either accounts for all of its input or it has a bug. Observed activity
 * must equal normalized plus deliberately-unconverted events; canonical events
 * must equal normalized minus collapsed duplicates. `balanced` checks the first
 * arithmetic identity, and it exists so that a silently dropped event is a
 * number that changes rather than an absence nobody notices.
 *
 * ## Consumers
 *
 * - TASKS 4.8 renders the error states this disambiguates — a truncated walk is
 *   not an empty account.
 * - TASKS 8.3 (Evidence Transparency) surfaces "observed activity scope" and
 *   "limitations" directly to users. The limitations here are that data.
 * - PRD §10 requires every claim built on public evidence to be able to say what
 *   it saw. This is the structure that answers it.
 */
import type { NormalizationResult } from "./developer-event";
import type { DedupeResult } from "./event-dedupe";
import type { RepositoryObservation } from "./github/repositories";
import type { ActivityObservation } from "./github/activity";
import type { EventRelevance } from "./github/activity";

/** What ended a paginated walk. Discriminated, so a consumer can't guess. */
export type PaginationStop =
  /** GitHub stopped offering a next page. The only complete outcome. */
  | "exhausted"
  /** Our own page cap stopped it while GitHub still offered more. */
  | "page_cap"
  /**
   * GitHub's documented server-side limit stopped it. Not our cap, and not a
   * failure — but the walk is bounded by something other than the data.
   */
  | "server_ceiling";

export interface PaginationCoverage {
  /** Pages actually walked. */
  pages: number;
  /** True when the walk ended for any reason other than exhausting the feed. */
  truncated: boolean;
  stoppedBy: PaginationStop;
  /**
   * Whether the result is complete.
   *
   * Not the same as `!truncated` once a server ceiling is in play: a walk that
   * hit GitHub's own limit was not truncated by us, but "complete" would still
   * overstate it — there is more data GitHub simply will not serve.
   */
  complete: boolean;
}

export interface TimeRange {
  oldest: string | null;
  newest: string | null;
}

export interface RepositoryCoverage {
  /** Repositories observed. */
  observed: number;
  /**
   * GitHub's own public repository count, from the profile, when known.
   *
   * Present because it is the only independent check on the walk: comparing it
   * against `observed` is how an incomplete inventory becomes visible.
   */
  declared: number | null;
  /** `declared - observed` when GitHub reported more than was observed. */
  shortfall: number | null;
  pagination: PaginationCoverage;
  /** Oldest `created_at` observed. There is no "newest createdAt" observed. */
  oldestCreatedAt: string | null;
  /**
   * Newest `pushed_at` observed.
   *
   * Deliberately separate from creation date: last activity is not creation, and
   * folding the two into one range would let a consumer read "the newest
   * repository was created recently" from data that only says it was pushed to
   * recently.
   */
  lastActivityAt: string | null;
}

export interface ActivityCoverage {
  /** Events observed. */
  observed: number;
  pagination: PaginationCoverage;
  /** The 300-event documented ceiling was reached. */
  atCeiling: boolean;
  /**
   * Oldest and newest `created_at` observed.
   *
   * Deliberately *not* described as a coverage window. The feed is not
   * time-ordered — a backfill can surface events years past everything else — so
   * this range is a true minimum and maximum but says nothing about which days
   * were covered. See `lib/github/activity.ts`.
   */
  eventWindow: TimeRange;
  byType: Record<string, number>;
  byRelevance: Record<EventRelevance, number>;
}

export interface Reconciliation {
  /** Events handed to normalization. */
  observed: number;
  /** Events normalized into a canonical form. */
  normalized: number;
  /** Input deliberately not converted (no canonical kind). */
  unsupported: number;
  /**
   * `observed === normalized + unsupported`.
   *
   * A run that drops input without recording it fails this, which is the point:
   * coverage that silently loses events has no defence other than being counted.
   */
  balanced: boolean;
  /** Identities surviving deduplication. */
  canonical: number;
  /**
   * Observations collapsed as repeats of an identity already seen.
   *
   * Derived as `normalized - canonical`, so it presumes the two stages were
   * passed consistently. Clamped at zero because a negative count would be
   * meaningless either way, and `balanced` is the check that actually catches an
   * inconsistent pipeline.
   */
  duplicatesCollapsed: number;
}

/**
 * One thing this run cannot support, with what a consumer must not conclude.
 *
 * The `implication` is not documentation. It is the field TASKS 8.3 renders, and
 * the reason the report exists: a limitation without its consequence invites a
 * consumer to guess, and guessing is how a scoring rule comes to assume
 * something the evidence never showed.
 */
export interface CoverageLimitation {
  code: string;
  /** Events or records this limitation applies to. */
  count: number;
  implication: string;
}

export interface CoverageReport {
  login: string;
  githubId: number | null;
  repositories: RepositoryCoverage;
  activity: ActivityCoverage;
  reconciliation: Reconciliation;
  limitations: CoverageLimitation[];
  /**
   * True only when nothing was truncated, nothing hit a server ceiling, and the
   * input reconciled.
   *
   * A consumer is entitled to treat the counts as exhaustive when this is true,
   * and is not entitled to when it is false. Note it is deliberately *not*
   * "did we see a lot" — a quiet developer's complete report and an active
   * developer's ceiling-limited report both exist.
   */
  complete: boolean;
}

export interface CoverageInput {
  login: string;
  /** GitHub's numeric id for the developer, when the profile was fetched. */
  githubId?: number | null;
  /** The profile's self-reported public repository count, when known. */
  declaredRepositoryCount?: number | null;
  repositories: RepositoryObservation;
  activity: ActivityObservation;
  normalized: NormalizationResult;
  deduplicated: DedupeResult;
}

/** Resolves how a walk ended. */
function paginationOf(
  pages: number,
  truncated: boolean,
  serverCeiling: boolean,
): PaginationCoverage {
  let stoppedBy: PaginationStop;
  if (serverCeiling) stoppedBy = "server_ceiling";
  else if (truncated) stoppedBy = "page_cap";
  else stoppedBy = "exhausted";

  return {
    pages,
    truncated,
    stoppedBy,
    // A server ceiling is GitHub's bound, not ours, but "complete" would still
    // promise more than the run can show.
    complete: stoppedBy === "exhausted",
  };
}

const LIMPLICATION: Record<string, string> = {
  commit_count_unavailable:
    "Commit volume cannot be scored from this run — a push event carries no commit list.",
  diff_stats_unavailable:
    "Pull request size cannot be scored from this run — the payload is a five-field stub.",
  merge_status_unknown:
    "These closed pull requests cannot be read as unmerged; only a positive merged action is decided.",
  authorship_unknown:
    "It cannot be determined whether these issues were opened by this developer.",
  repository_unconfirmed:
    "Repository ownership is unconfirmed for these events, so they cannot be asserted to be the developer's own repositories.",
  timestamp_missing:
    "These events carry no timestamp and cannot be ordered against the rest of the run.",
};

/** Aggregates the per-event limitations carried on the canonical events. */
function aggregateLimitations(
  input: CoverageInput,
): CoverageLimitation[] {
  const counts = new Map<string, number>();

  for (const event of input.deduplicated.events) {
    for (const limitation of event.limitations) {
      counts.set(limitation, (counts.get(limitation) ?? 0) + 1);
    }
  }

  const limitations: CoverageLimitation[] = [...counts.entries()]
    .map(([code, count]) => ({
      code,
      count,
      implication: LIMPLICATION[code] ?? "Consequence not characterised.",
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  // Walk-level limits, appended after the per-event ones because they describe
  // the run rather than any individual event.
  if (input.repositories.truncated) {
    limitations.push({
      code: "repository_inventory_truncated",
      count: input.repositories.count,
      implication:
        "The repository list may be incomplete, so repository coverage is not exhaustive and absence of a repository is not evidence it does not exist.",
    });
  }

  if (input.activity.atCeiling) {
    limitations.push({
      code: "activity_ceiling_reached",
      count: input.activity.count,
      implication:
        "GitHub served the maximum events it exposes, so older activity was not observed. The observed window is not a measure of the developer's history.",
    });
  }

  if (input.normalized.unsupported.length > 0) {
    const total = input.normalized.unsupported.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    limitations.push({
      code: "events_without_canonical_form",
      count: total,
      implication:
        "Some observed events have no canonical form and were not converted, so they contribute nothing to scoring.",
    });
  }

  return limitations;
}

/**
 * Builds the coverage report for one ingestion run.
 *
 * Pure: it only reads the observations, and never re-fetches or re-walks
 * anything. The same observations always produce the same report, which is what
 * makes the report safe to store beside a scoring result.
 */
export function buildCoverage(input: CoverageInput): CoverageReport {
  const declared = input.declaredRepositoryCount ?? null;
  const observedRepos = input.repositories.count;

  const shortfall =
    declared !== null && declared > observedRepos ? declared - observedRepos : null;

  // A truncated repository walk means the inventory against which attribution
  // was checked is itself incomplete, which is worth stating explicitly rather
  // than leaving to be inferred from `shortfall`.
  const repositories: RepositoryCoverage = {
    observed: observedRepos,
    declared,
    shortfall,
    pagination: paginationOf(
      input.repositories.pages,
      input.repositories.truncated,
      false,
    ),
    oldestCreatedAt: input.repositories.oldestCreatedAt,
    lastActivityAt: input.repositories.latestActivityAt,
  };

  const activity: ActivityCoverage = {
    observed: input.activity.count,
    // The activity feed's own ceiling is GitHub's, not ours: it is reported
    // through `atCeiling` rather than as a `page_cap` truncation.
    pagination: paginationOf(
      input.activity.pages,
      input.activity.truncated,
      input.activity.atCeiling,
    ),
    atCeiling: input.activity.atCeiling,
    eventWindow: {
      oldest: input.activity.oldestAt,
      newest: input.activity.newestAt,
    },
    byType: input.activity.byType,
    byRelevance: input.activity.byRelevance,
  };

  const unsupportedTotal = input.normalized.unsupported.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );

  const reconciliation: Reconciliation = {
    observed: input.activity.count,
    normalized: input.normalized.events.length,
    unsupported: unsupportedTotal,
    balanced: input.activity.count === input.normalized.events.length + unsupportedTotal,
    canonical: input.deduplicated.events.length,
    duplicatesCollapsed: Math.max(
      0,
      input.normalized.events.length - input.deduplicated.events.length,
    ),
  };

  return {
    login: input.login,
    githubId: input.githubId ?? null,
    repositories,
    activity,
    reconciliation,
    limitations: aggregateLimitations(input),
    complete:
      repositories.pagination.complete &&
      activity.pagination.complete &&
      reconciliation.balanced,
  };
}