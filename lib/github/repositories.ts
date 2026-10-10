/**
 * RootRealm — repository fetching (TASKS 4.3).
 *
 * ```text
 * username → paginated public repositories
 * ```
 *
 * The transport (pagination, retries, validation) is TASKS 4.1; this module
 * owns the three things TASKS 4.3 actually asks for:
 *
 * - **pagination works** — every page is walked and merged, and the result
 *   reports `pages` and `truncated` so a partial walk can never be mistaken for
 *   a complete one;
 * - **archived state is preserved** — an archived repository is still observed
 *   work, so nothing is filtered here. Deciding what a fork, a template or an
 *   archived repository is *worth* belongs to scoring (TASKS 5.x), and doing it
 *   here would discard evidence the explanation ledger (TASKS 5.10) has to be
 *   able to cite;
 * - **repository identifiers are normalised** — every record carries a stable
 *   key that survives a rename.
 *
 * Nothing here scores or persists. Normalization to the canonical
 * `DeveloperEvent` is TASKS 4.5.
 */
import type { GitHubClient } from "./client";
import { toFailure, type IngestionFailure } from "./failure";
import type { RateLimitState } from "./rate-limit";
import type { GitHubRepository } from "./types";

/**
 * One observed public repository.
 *
 * `repositoryId` is the identifier that matters. A `fullName` changes when a
 * repository is renamed or transferred, so it is display data, not a key —
 * TASKS 4.6 deduplicates on this id, and a persisted event must resolve back to
 * the same repository after a rename.
 */
export interface RepositoryRecord {
  /** GitHub's stable numeric id. Survives renames and transfers. */
  repositoryId: number;
  /** `owner/name` as observed now. For display and evidence links. */
  fullName: string;
  /** Lower-cased `owner/name`, for case-insensitive matching. */
  slug: string;
  ownerLogin: string;
  name: string;
  description: string | null;
  url: string | null;
  primaryLanguage: string | null;
  /** Preserved, never filtered — scoring decides what a fork is worth. */
  isFork: boolean;
  /** Preserved, never filtered — archived work is still observed work. */
  isArchived: boolean;
  isDisabled: boolean;
  isTemplate: boolean;
  stars: number | null;
  forksCount: number | null;
  watchers: number | null;
  openIssues: number | null;
  /** GitHub reports `size` in kilobytes. */
  sizeKb: number | null;
  topics: string[];
  /** SPDX identifier, or `"NOASSERTION"` when GitHub could not identify it. */
  license: string | null;
  defaultBranch: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  pushedAt: string | null;
  /** The exact payload GitHub returned. */
  source: GitHubRepository;
}

/**
 * What was actually observed.
 *
 * The counts and the time range are not the full coverage model — that is
 * TASKS 4.7 — but a repository list without its length and its window cannot
 * honestly answer "what did we see?", which PRD §10 requires of every claim
 * built on public evidence.
 */
export interface RepositoryObservation {
  repositories: RepositoryRecord[];
  /** Repositories returned. */
  count: number;
  /** Pages walked to produce the list. */
  pages: number;
  /** True when GitHub still offered a next page when the cap stopped the walk. */
  truncated: boolean;
  /** Earliest `createdAt` observed, or null when no repository had one. */
  oldestCreatedAt: string | null;
  /** Latest `pushedAt` observed, or null when no repository had one. */
  latestActivityAt: string | null;
}

export type RepositoryResult =
  | { ok: true; observation: RepositoryObservation; rateLimit: RateLimitState }
  | { ok: false; failure: IngestionFailure; rateLimit: RateLimitState };

/** Narrows a validated repository to the fields RootRealm keeps. */
function toRecord(repo: GitHubRepository): RepositoryRecord {
  return {
    repositoryId: repo.id,
    fullName: repo.fullName,
    slug: repo.fullName.toLowerCase(),
    ownerLogin: repo.ownerLogin,
    name: repo.name,
    description: repo.description,
    url: repo.htmlUrl,
    primaryLanguage: repo.language,
    isFork: repo.fork,
    isArchived: repo.archived,
    isDisabled: repo.disabled,
    isTemplate: repo.isTemplate,
    stars: repo.stars,
    forksCount: repo.forks,
    watchers: repo.watchers,
    openIssues: repo.openIssues,
    sizeKb: repo.sizeKb,
    topics: repo.topics,
    license: repo.license,
    defaultBranch: repo.defaultBranch,
    createdAt: repo.createdAt,
    updatedAt: repo.updatedAt,
    pushedAt: repo.pushedAt,
    source: repo,
  };
}

/**
 * The newest of a set of timestamps, ignoring nulls.
 *
 * ISO-8601 timestamps from GitHub all share a format and a UTC offset, so a
 * string comparison is a correct chronological one; `Date.parse` would be
 * needed only if the formats diverged.
 */
function latest(values: Array<string | null>): string | null {
  let newest: string | null = null;

  for (const value of values) {
    if (value === null) continue;
    if (newest === null || value > newest) newest = value;
  }

  return newest;
}

/** The earliest of a set of timestamps, ignoring nulls. */
function earliest(values: Array<string | null>): string | null {
  let oldest: string | null = null;

  for (const value of values) {
    if (value === null) continue;
    if (oldest === null || value < oldest) oldest = value;
  }

  return oldest;
}

export interface FetchRepositoriesOptions {
  signal?: AbortSignal;
}

/**
 * Fetches every page of a developer's public repositories.
 *
 * Never throws for an expected failure — every one is returned as
 * `{ ok: false, failure }` with the rate-limit state attached, exactly like
 * `fetchPublicProfile` (TASKS 4.2).
 */
export async function fetchRepositories(
  client: GitHubClient,
  username: string,
  options: FetchRepositoriesOptions = {},
): Promise<RepositoryResult> {
  try {
    const page = await client.listRepositories(username, { signal: options.signal });
    const repositories = page.items.map(toRecord);

    return {
      ok: true,
      observation: {
        repositories,
        count: repositories.length,
        pages: page.pages,
        truncated: page.truncated,
        oldestCreatedAt: earliest(repositories.map((r) => r.createdAt)),
        latestActivityAt: latest(repositories.map((r) => r.pushedAt)),
      },
      rateLimit: client.rateLimitState(),
    };
  } catch (error) {
    const rateLimit = client.rateLimitState();
    const failure = toFailure(error, rateLimit);

    // A programming error is not an ingestion outcome; re-throw it rather than
    // reporting it as a GitHub outage.
    if (!failure) throw error;

    return { ok: false, failure, rateLimit };
  }
}