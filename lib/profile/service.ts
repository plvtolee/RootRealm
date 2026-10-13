/**
 * RootRealm — the public profile service (TASKS 8.2).
 *
 * ```text
 * GitHub username → real RootRealm profile preview (no login required)
 * ```
 *
 * TASKS 8.2 asks that a GitHub username produce a real preview with no login.
 * This is the server-side path that does it: fetch the public data (Phase 4),
 * normalize it (TASKS 4.5), deduplicate it (TASKS 4.6) and aggregate it (TASKS
 * 8.1). The route and the screen above it hold none of that knowledge.
 *
 * ## Reuses the existing ingestion, does not reimplement it
 *
 * Every fetch goes through the same `lib/github/*` services the ingestion routes
 * use, and normalization is the same `normalizeActivity`. A preview that scored
 * differently from the eventual real profile would be worse than no preview, so
 * there is exactly one path from activity to numbers and this calls it.
 *
 * ## What it does not do
 *
 * - No persistence. Nothing is stored; the preview is computed per request, as
 *   the ingestion routes already are (persistence is Phase 10).
 * - No OAuth. Ownership is not verified, so the aggregated character is
 *   `verified: false` — the honest state for a public lookup.
 */

import { fetchActivity } from "../github/activity";
import { fetchPublicProfile, createProfileClient, type PublicProfile } from "../github/profile";
import { fetchRepositories, type RepositoryRecord } from "../github/repositories";
import type { FailureReason } from "../github/failure";
import type { RateLimitState } from "../github/rate-limit";
import { normalizeActivity, type DeveloperEvent } from "../developer-event";
import { dedupeEvents } from "../event-dedupe";
import { buildCoverage, type CoverageReport } from "../coverage";
import { scoreEvents } from "../scoring/engine";
import { SCORING_V1 } from "../scoring/types";
import { aggregateProfile, type AggregatedProfile, type FeaturedRepository } from "./aggregate";

/** The successful result of a preview lookup. */
export interface ProfilePreview {
  readonly profile: AggregatedProfile;
  /** The raw GitHub profile, for the identity fields the aggregate does not keep. */
  readonly github: PublicProfile | null;
  /** Coverage of the ingestion run, so the preview can name its own limits. */
  readonly coverage: CoverageReport;
  readonly rateLimit: RateLimitState;
  readonly repositories: readonly RepositoryRecord[];
  /** Scoring explanations, newest first (TASKS 8.3). */
  readonly explanations: readonly ProfileExplanation[];
  /**
   * The normalized, deduplicated evidence every screen derives from.
   *
   * ARCHITECTURE §1 requires that "the same normalized evidence must be reusable
   * across the profile, skill tree, achievements and scoring systems" — and the
   * UI must never be the source of truth for progression. That makes this the one
   * thing the skill tree and the achievement screen need, and returning it here
   * is what lets all of them share a single ingestion run instead of each one
   * asking GitHub separately and possibly getting a different answer.
   */
  readonly events: readonly DeveloperEvent[];
}

/** A lookup that could not produce a profile. */
export interface ProfilePreviewFailure {
  readonly reason: FailureReason;
  readonly message: string;
  readonly retryAfterMs: number | null;
  readonly rateLimit: RateLimitState;
}

export type ProfilePreviewResult =
  | { ok: true; preview: ProfilePreview }
  | { ok: false; failure: ProfilePreviewFailure };

/** One scored event, explained (TASKS 8.3). */
export interface ProfileExplanation {
  readonly eventId: string;
  readonly classification: string | null;
  readonly eligible: boolean;
  readonly xp: number;
  readonly reason: string;
  readonly sourceUrl: string | null;
  readonly occurredAt: string | null;
}

/**
 * Builds a public profile preview for a GitHub login.
 *
 * The three fetches are independent, so they run concurrently. A failure in the
 * repository or activity walk returns a failure rather than a partial profile:
 * an unconfirmed repository list would mark every event `inferred` and present a
 * confident-looking wrong score, which the ingestion route already refuses for
 * the same reason.
 */
export async function buildProfilePreview(
  username: string,
  options: { signal?: AbortSignal } = {},
): Promise<ProfilePreviewResult> {
  const client = createProfileClient();
  const signal = options.signal;

  const [profile, repositories, activity] = await Promise.all([
    fetchPublicProfile(client, username, { signal }),
    fetchRepositories(client, username, { signal }),
    fetchActivity(client, username, { signal }),
  ]);

  if (!repositories.ok) {
    return { ok: false, failure: failureOf(repositories.failure, repositories.rateLimit) };
  }

  if (!activity.ok) {
    return { ok: false, failure: failureOf(activity.failure, activity.rateLimit) };
  }

  const normalized = normalizeActivity(activity.observation.events, {
    developerLogin: username,
    developerId: profile.ok ? profile.profile.githubId : null,
    confirmedRepositoryIds: new Set(
      repositories.observation.repositories
        .map((repository) => repository.repositoryId)
        .filter((id): id is number => id !== null),
    ),
  });

  const deduplicated = dedupeEvents(normalized.events);

  const coverage = buildCoverage({
    login: username,
    githubId: profile.ok ? profile.profile.githubId : null,
    declaredRepositoryCount: profile.ok ? profile.profile.publicRepos : null,
    repositories: repositories.observation,
    activity: activity.observation,
    normalized,
    deduplicated,
  });

  const featured = pickFeaturedRepository(repositories.observation.repositories);
  const aggregated = aggregateProfile({
    login: username,
    profile: profile.ok ? profile.profile : null,
    events: deduplicated.events,
    featuredRepository: featured,
  });

  return {
    ok: true,
    preview: {
      profile: aggregated,
      github: profile.ok ? profile.profile : null,
      coverage,
      rateLimit: activity.rateLimit,
      repositories: repositories.observation.repositories,
      explanations: explain(deduplicated.events),
      events: deduplicated.events,
    },
  };
}

function failureOf(
  failure: { reason: FailureReason; message: string; retryAfterMs: number | null },
  rateLimit: RateLimitState,
): ProfilePreviewFailure {
  return {
    reason: failure.reason,
    message: failure.message,
    retryAfterMs: failure.retryAfterMs,
    rateLimit,
  };
}

/**
 * The featured repository: the most-starred non-fork, or the most-starred of
 * any kind when every repository is a fork.
 *
 * A deterministic pick rather than a developer choice — choosing a featured
 * project is a later product affordance. It is stable for the same inputs, so
 * the preview does not reshuffle between loads.
 */
function pickFeaturedRepository(repositories: readonly RepositoryRecord[]): FeaturedRepository | null {
  if (repositories.length === 0) return null;

  const preferred = repositories.filter((repository) => !repository.isFork && !repository.isArchived);
  const pool = preferred.length > 0 ? preferred : repositories;

  const best = [...pool].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))[0];
  if (best === undefined) return null;

  return {
    fullName: best.fullName,
    description: best.description,
    url: best.url,
    primaryLanguage: best.primaryLanguage,
    stars: best.stars,
  };
}

/** Turns scored, deduplicated events into the explanation list (TASKS 8.3). */
function explain(events: readonly DeveloperEvent[]): ProfileExplanation[] {
  return scoreEvents(events, SCORING_V1).map((result, index) => ({
    eventId: result.eventId,
    classification: result.classification,
    eligible: result.eligible,
    xp: result.xp,
    reason: result.reason,
    sourceUrl: events[index]?.sourceUrl ?? null,
    occurredAt: events[index]?.occurredAt ?? null,
  }));
}