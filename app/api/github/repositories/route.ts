/**
 * RootRealm — `GET /api/github/repositories` (TASKS 4.3).
 *
 * The server boundary for a developer's public repositories. As with the profile
 * route it holds no GitHub knowledge: it reads the one query parameter, calls
 * the ingestion service, and translates the result into an HTTP status using the
 * shared mapping in `lib/github/failure.ts`.
 *
 * The client is constructed per request, so the token stays server-side.
 */
import { errorStateFor } from "@/lib/github/error-states";
import { statusForReason, type FailureReason } from "@/lib/github/failure";
import { createProfileClient } from "@/lib/github/profile";
import {
  fetchRepositories,
  type RepositoryObservation,
} from "@/lib/github/repositories";
import type { RateLimitState } from "@/lib/github/rate-limit";

/** No caching: a lookup is a live read, and the budget is already rate-limited. */
export const dynamic = "force-dynamic";

interface RepositoryResponseBody {
  observation: RepositoryObservation | null;
  failure: {
    reason: FailureReason;
    message: string;
    retryAfterMs: number | null;
  } | null;
  rateLimit: RateLimitState;
}

/**
 * `GET /api/github/repositories?username=<login>`.
 *
 * All pages are walked and returned in one response. A walk capped at ten pages
 * of 100 is still a large payload, so `truncated` is part of the contract: the
 * browser must be able to say "we saw at least this many" rather than "this is
 * everything". TASKS 4.7 will replace the ad-hoc preview with real coverage
 * reporting.
 */
export async function GET(request: Request): Promise<Response> {
  const username = new URL(request.url).searchParams.get("username") ?? "";

  const client = createProfileClient();
  const result = await fetchRepositories(client, username, {
    signal: request.signal,
  });

  if (result.ok) {
    const body: RepositoryResponseBody = {
      observation: result.observation,
      failure: null,
      rateLimit: result.rateLimit,
    };

    return Response.json(body, { status: 200 });
  }

  const { reason, retryAfterMs } = result.failure;

  const body: RepositoryResponseBody = {
    observation: null,
    // `detail` is intentionally dropped: it carries GitHub's raw wording and is
    // for server logs, not for the browser. The copy the browser renders comes
    // from `errorStateFor` so the API and the UI cannot describe one reason two
    // different ways.
    failure: {
      reason,
      message: errorStateFor(reason, retryAfterMs).message,
      retryAfterMs,
    },
    rateLimit: result.rateLimit,
  };

  return Response.json(body, {
    status: statusForReason(reason),
    headers: retryAfterMs === null
      ? undefined
      : { "retry-after": String(Math.ceil(retryAfterMs / 1000)) },
  });
}