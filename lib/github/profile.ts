/**
 * RootRealm — public profile fetching (TASKS 4.2).
 *
 * ```text
 * username → GitHub profile
 * ```
 *
 * The seam between the transport client (TASKS 4.1) and anything that renders.
 * It answers TASKS 4.2's acceptance criteria in one place:
 *
 * - a valid user resolves to a {@link PublicProfile};
 * - an invalid user produces a controlled {@link IngestionFailure} rather than
 *   a thrown `GitHubError`, so no screen ever has to catch;
 * - the payload is validated by the client before it reaches this layer, so a
 *   {@link PublicProfile} can only exist in the shape the UI may rely on.
 *
 * It returns a discriminated union instead of throwing: ingestion has several
 * *expected* failure modes, and a result type makes each one an explicit branch
 * the UI must render. The reasons and their HTTP statuses live in
 * `failure.ts` and are shared with the repository and activity services.
 *
 * Nothing here scores, normalises or persists. Normalization to the canonical
 * `DeveloperEvent` is TASKS 4.5.
 */
import { GitHubClient, type GitHubClientOptions } from "./client";
import { toFailure, type IngestionFailure } from "./failure";
import type { RateLimitState } from "./rate-limit";
import type { GitHubUser } from "./types";

/**
 * A validated public profile, in the identity fields the profile screen and
 * the later character aggregation (TASKS 8.1) read.
 *
 * `login` is the handle as GitHub reports it and the key for a single ingestion
 * run. `githubId` is kept alongside it because a login can be renamed, and a
 * persisted `DeveloperEvent` (TASKS 4.5) must survive that.
 */
export interface PublicProfile {
  login: string;
  githubId: number;
  name: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  publicRepos: number | null;
  publicGists: number | null;
  followers: number | null;
  following: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** The exact payload GitHub returned, for evidence links and debugging. */
  source: GitHubUser;
}

export type ProfileResult =
  | { ok: true; profile: PublicProfile; rateLimit: RateLimitState }
  | { ok: false; failure: IngestionFailure; rateLimit: RateLimitState };

/**
 * Builds a client from the server environment.
 *
 * The token is optional: anonymous access is 60 requests/hour, which is enough
 * for a guest profile preview (TASKS 8.2) but not for sync (TASKS 11.2). It is
 * read here, on the server, and is never returned to a caller.
 *
 * Named for the profile service it was introduced for, but deliberately generic
 * in behaviour so the repository and activity services (TASKS 4.3, 4.4) reuse
 * it rather than each reading the environment.
 */
export function createProfileClient(
  options: GitHubClientOptions = {},
): GitHubClient {
  return new GitHubClient({
    token: options.token ?? process.env.GITHUB_TOKEN,
    ...options,
  });
}

/** Narrows a validated user to the identity fields RootRealm keeps. */
function toProfile(user: GitHubUser): PublicProfile {
  return {
    login: user.login,
    githubId: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    profileUrl: user.htmlUrl,
    bio: user.bio,
    company: user.company,
    location: user.location,
    blog: user.blog,
    publicRepos: user.publicRepos,
    publicGists: user.publicGists,
    followers: user.followers,
    following: user.following,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    source: user,
  };
}

export interface FetchProfileOptions {
  signal?: AbortSignal;
}

/**
 * Resolves a username to a public profile.
 *
 * Never throws for an expected failure — every one is returned as
 * `{ ok: false, failure }` with the rate-limit state attached, so a caller can
 * tell "GitHub said no" apart from "we are rate limited" without inspecting an
 * error object.
 */
export async function fetchPublicProfile(
  client: GitHubClient,
  username: string,
  options: FetchProfileOptions = {},
): Promise<ProfileResult> {
  try {
    const user = await client.getUser(username, { signal: options.signal });

    return {
      ok: true,
      profile: toProfile(user),
      rateLimit: client.rateLimitState(),
    };
  } catch (error) {
    const rateLimit = client.rateLimitState();
    const failure = toFailure(error, rateLimit);

    // `assertServerOnly` and a programming error are not ingestion outcomes;
    // re-throwing keeps a real bug visible instead of reporting it as a GitHub
    // outage.
    if (!failure) throw error;

    return { ok: false, failure, rateLimit };
  }
}