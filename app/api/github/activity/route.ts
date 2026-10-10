/**
 * RootRealm — `GET /api/github/activity` (TASKS 4.4).
 *
 * The server boundary for a developer's recent public activity. As with the
 * profile and repository routes it holds no GitHub knowledge: it reads the one
 * query parameter, calls the ingestion service, and translates the result into an
 * HTTP status using the shared mapping in `lib/github/failure.ts`.
 *
 * The client is constructed per request, so the token stays server-side.
 */
import { fetchActivity, type ActivityObservation } from "@/lib/github/activity";
import { errorStateFor } from "@/lib/github/error-states";
import { statusForReason, type FailureReason } from "@/lib/github/failure";
import { createProfileClient } from "@/lib/github/profile";
import type { RateLimitState } from "@/lib/github/rate-limit";

/** No caching: a lookup is a live read, and the budget is already rate-limited. */
export const dynamic = "force-dynamic";

interface ActivityResponseBody {
  observation: ActivityObservation | null;
  failure: {
    reason: FailureReason;
    message: string;
    retryAfterMs: number | null;
  } | null;
  rateLimit: RateLimitState;
}

/**
 * `GET /api/github/activity?username=<login>`.
 *
 * Up to 300 events are returned in one response, so this is a larger payload
 * than the other two lookups. `truncated` and `atCeiling` are part of the
 * contract for the same reason they are on repositories: a caller must be able
 * to distinguish "this is everything" from "this is all GitHub will give us".
 * For a very active developer that is a couple of days of events, and the feed
 * is not time-ordered, so neither `count` nor the reported window describes a
 * period. TASKS 4.7 replaces the ad-hoc preview with real coverage reporting.
 */
export async function GET(request: Request): Promise<Response> {
  const username = new URL(request.url).searchParams.get("username") ?? "";

  const client = createProfileClient();
  const result = await fetchActivity(client, username, {
    signal: request.signal,
  });

  if (result.ok) {
    const body: ActivityResponseBody = {
      observation: result.observation,
      failure: null,
      rateLimit: result.rateLimit,
    };

    return Response.json(body, { status: 200 });
  }

  const { reason, retryAfterMs } = result.failure;

  const body: ActivityResponseBody = {
    observation: null,
    // `detail` is intentionally dropped: it carries GitHub's raw wording and is
    // for server logs, not for the browser.
    failure: {
      reason,
      // detail is intentionally dropped: it carries GitHub's raw wording and is
      // for server logs, not for the browser. The copy the browser renders comes
      // from errorStateFor so the API and the UI cannot describe one reason two
      // different ways.
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