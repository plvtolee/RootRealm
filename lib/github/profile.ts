/**
 * RootRealm — public profile fetching (TASKS 4.2).
 *
 * ```text
 * username → GitHub profile
 * ```
 *
 * This is the seam between the transport client (TASKS 4.1) and anything that
 * renders. It answers TASKS 4.2's three acceptance criteria in one place:
 *
 * - a valid user resolves to a {@link PublicProfile};
 * - an invalid user produces a controlled {@link ProfileFailure} rather than a
 *   thrown `GitHubError`, so no screen ever has to catch;
 * - the payload is validated by the client before it reaches this layer, so a
 *   {@link PublicProfile} can only exist in the shape the UI may rely on.
 *
 * It deliberately returns a discriminated union instead of throwing: ingestion
 * has several *expected* failure modes (unknown account, rate limit, GitHub
 * outage), and a result type makes each one an explicit branch the UI must
 * render. TASKS 4.8 will extend this union with the remaining error states; it
 * will not replace it.
 *
 * Nothing here scores, normalises or persists. Normalization to the canonical
 * `DeveloperEvent` is TASKS 4.5.
 */
import { GitHubClient, type GitHubClientOptions } from "./client";
import { isGitHubError, type GitHubErrorKind } from "./errors";
import type { RateLimitState } from "./rate-limit";
import type { GitHubUser } from "./types";

/**
 * A validated public profile, in the identity fields the profile screen and
 * the later character aggregation (TASKS 8.1) read.
 *
 * `login` is the canonical lower-cased handle and the stable key for the whole
 * ingestion run. `githubId` is kept alongside it because a login can be
 * renamed, and a persisted `DeveloperEvent` (TASKS 4.5) must survive that.
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

/**
 * The controlled failure reasons a UI must be able to distinguish. Each one
 * implies a different message and a different next action, which is why they
 * are not collapsed into a single `error` case:
 *
 * - `invalid_username` — nothing was requested; fix the input;
 * - `not_found` — no such public account; fix the input;
 * - `rate_limited` — GitHub's budget is spent; retry later;
 * - `unavailable` — GitHub failed or timed out; retry later;
 * - `unexpected_response` — the payload did not match the contract; retry
 *   later and report it.
 */
export type ProfileFailureReason =
  | "invalid_username"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "unexpected_response";

export interface ProfileFailure {
  reason: ProfileFailureReason;
  /** Safe to show a user; never contains the token or a stack trace. */
  message: string;
  /** GitHub's own message when one was returned, for server-side logs. */
  detail: string | null;
  /** Milliseconds until the budget resets, when GitHub said so. */
  retryAfterMs: number | null;
}

export type ProfileResult =
  | { ok: true; profile: PublicProfile; rateLimit: RateLimitState }
  | { ok: false; failure: ProfileFailure; rateLimit: RateLimitState };

/** Transport kinds that mean "the account does not exist or is not public". */
const NOT_FOUND: ReadonlySet<GitHubErrorKind> = new Set<GitHubErrorKind>(["not_found"]);

const REASON_MESSAGE: Record<ProfileFailureReason, string> = {
  invalid_username: "That is not a valid GitHub username.",
  not_found: "No public GitHub account exists with that username.",
  rate_limited: "GitHub's rate limit has been reached. Try again shortly.",
  unavailable: "GitHub is unavailable right now. Try again shortly.",
  unexpected_response: "GitHub returned an unexpected response. Try again shortly.",
};

/**
 * Collapses the transport taxonomy into the product-facing reasons. The
 * mapping is total and explicit so an unmapped kind is a type error rather than
 * a silently generic error.
 */
function reasonFor(kind: GitHubErrorKind): ProfileFailureReason {
  if (kind === "invalid_username") return "invalid_username";
  if (NOT_FOUND.has(kind)) return "not_found";
  if (kind === "rate_limited") return "rate_limited";
  if (
    kind === "server_error" ||
    kind === "network_error" ||
    kind === "timeout" ||
    kind === "forbidden" ||
    kind === "unauthorized"
  ) {
    return "unavailable";
  }
  return "unexpected_response";
}

/**
 * Builds a client from the server environment.
 *
 * The token is optional: anonymous access is 60 requests/hour, which is enough
 * for a guest profile preview (TASKS 8.2) but not for sync (TASKS 11.2). It is
 * read here, on the server, and is never returned to a caller.
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

    // `assertServerOnly` and a programming error are not ingestion outcomes;
    // re-throwing keeps a real bug visible instead of reporting it as a GitHub
    // outage.
    if (!isGitHubError(error)) throw error;

    const reason = reasonFor(error.kind);

    return {
      ok: false,
      failure: {
        reason,
        message: REASON_MESSAGE[reason],
        detail: error.message,
        retryAfterMs: error.retryAfterMs ?? rateLimit.retryAfterMs,
      },
      rateLimit,
    };
  }
}