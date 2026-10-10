/**
 * RootRealm — `GET /api/github/developer-events` (TASKS 4.5).
 *
 * The normalization boundary: activity in, canonical `DeveloperEvent`s out.
 *
 * Unlike the other three routes this one composes two services, because
 * normalization needs both. Attribution depends on which repositories actually
 * belong to the developer (TASKS 4.3), so without the repository list every
 * event would be marked `inferred` — a check that never ran must not be reported
 * as a check that failed.
 *
 * It still holds no scoring knowledge and no normalization knowledge. It calls
 * the two ingestion services, hands their output to `normalizeActivity`, and
 * translates a failure into an HTTP status using the shared mapping.
 */
import { fetchActivity } from "@/lib/github/activity";
import { statusForReason, type FailureReason } from "@/lib/github/failure";
import { createProfileClient } from "@/lib/github/profile";
import { fetchRepositories } from "@/lib/github/repositories";
import type { RateLimitState } from "@/lib/github/rate-limit";
import {
  normalizeActivity,
  type NormalizationResult,
} from "@/lib/developer-event";

/** No caching: a lookup is a live read, and the budget is already rate-limited. */
export const dynamic = "force-dynamic";

interface DeveloperEventResponseBody {
  events: NormalizationResult["events"];
  byKind: NormalizationResult["byKind"];
  byConfidence: NormalizationResult["byConfidence"];
  /** Inputs deliberately not converted, with counts — so the loss is auditable. */
  unsupported: NormalizationResult["unsupported"];
  failure: {
    reason: FailureReason;
    message: string;
    retryAfterMs: number | null;
  } | null;
  rateLimit: RateLimitState;
}

/**
 * `GET /api/github/developer-events?username=<login>`.
 *
 * Either ingestion step may fail, and both failures are reported the same way:
 * a partial normalization built on an unconfirmed repository list would mark
 * every event `inferred` and present a confident-looking wrong answer.
 *
 * The repository walk is bounded and the activity walk is bounded at GitHub's
 * 300-event ceiling, so this is up to 13 requests. That is why the preview does
 * not call it eagerly — see the harness.
 */
export async function GET(request: Request): Promise<Response> {
  const username = new URL(request.url).searchParams.get("username") ?? "";

  const client = createProfileClient();
  const signal = request.signal;

  const [repositories, activity] = await Promise.all([
    fetchRepositories(client, username, { signal }),
    fetchActivity(client, username, { signal }),
  ]);

  if (!repositories.ok) {
    return failureBody(repositories.failure, repositories.rateLimit);
  }

  if (!activity.ok) {
    return failureBody(activity.failure, activity.rateLimit);
  }

  const normalized = normalizeActivity(activity.observation.events, {
    developerLogin: username,
    // The profile lookup is not repeated here; the repository records carry no
    // user id, and the login is the stable key for this run. TASKS 4.5 records
    // the numeric id when the caller has it (TASKS 8.1 aggregates by it).
    developerId: null,
    confirmedRepositoryIds: new Set(
      repositories.observation.repositories
        .map((repository) => repository.repositoryId)
        .filter((id): id is number => id !== null),
    ),
  });

  const body: DeveloperEventResponseBody = {
    events: normalized.events,
    byKind: normalized.byKind,
    byConfidence: normalized.byConfidence,
    unsupported: normalized.unsupported,
    failure: null,
    // Activity is fetched last-walked, so its rate-limit state is the newest.
    rateLimit: activity.rateLimit,
  };

  return Response.json(body, { status: 200 });
}

/** Shared failure response, mirroring the other routes. */
function failureBody(
  failure: { reason: FailureReason; message: string; retryAfterMs: number | null },
  rateLimit: RateLimitState,
): Response {
  const body: DeveloperEventResponseBody = {
    events: [],
    byKind: {
      push: 0,
      pull_request: 0,
      review: 0,
      issue: 0,
      release: 0,
      documentation: 0,
      lifecycle: 0,
    },
    byConfidence: { verified: 0, inferred: 0 },
    unsupported: [],
    // `detail` is intentionally dropped: it carries GitHub's raw wording and is
    // for server logs, not for the browser.
    failure: {
      reason: failure.reason,
      message: failure.message,
      retryAfterMs: failure.retryAfterMs,
    },
    rateLimit,
  };

  return Response.json(body, {
    status: statusForReason(failure.reason),
    headers: failure.retryAfterMs === null
      ? undefined
      : { "retry-after": String(Math.ceil(failure.retryAfterMs / 1000)) },
  });
}