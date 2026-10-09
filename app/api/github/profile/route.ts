/**
 * RootRealm — `GET /api/github/profile` (TASKS 4.2).
 *
 * The server boundary for a guest profile lookup. It is deliberately thin: it
 * validates the one input, calls the ingestion service, and translates the
 * result into an HTTP status. It holds no GitHub knowledge — no header parsing,
 * no retrying, no field validation — because all of that belongs to
 * `lib/github/client.ts`, and duplicating it here would be the second place to
 * update when GitHub changes.
 *
 * The client is constructed per request on purpose. The token is read from the
 * server environment and never leaves this process; the browser only ever sees
 * the fields in {@link ProfileResponseBody}.
 */
import {
  createProfileClient,
  fetchPublicProfile,
  type ProfileFailureReason,
  type PublicProfile,
} from "@/lib/github/profile";
import type { RateLimitState } from "@/lib/github/rate-limit";

/** No caching: a lookup is a live read, and the budget is already rate-limited. */
export const dynamic = "force-dynamic";

/**
 * `ProfileFailureReason` → HTTP status.
 *
 * `invalid_username` is a 400 because the caller sent something malformed;
 * `not_found` is a 404 because the resource genuinely does not exist; the rest
 * are 502/503/429 because the failure is upstream, not in the request. This
 * distinction matters to TASK 8.2: a 404 must be shown as "no such developer",
 * while a 503 must be shown as "try again", and neither may be rendered as an
 * empty profile.
 */
const STATUS_BY_REASON: Record<ProfileFailureReason, number> = {
  invalid_username: 400,
  not_found: 404,
  rate_limited: 429,
  unavailable: 503,
  unexpected_response: 502,
};

interface ProfileResponseBody {
  profile: PublicProfile | null;
  failure: {
    reason: ProfileFailureReason;
    message: string;
    retryAfterMs: number | null;
  } | null;
  rateLimit: RateLimitState;
}

/**
 * `GET /api/github/profile?username=<login>`.
 *
 * The parameter is passed through untouched: stripping a pasted `@` is a UI
 * affordance, and validating the login is the client's job, so there stays one
 * definition of a valid username.
 */
export async function GET(request: Request): Promise<Response> {
  const username = new URL(request.url).searchParams.get("username") ?? "";

  const client = createProfileClient();
  const result = await fetchPublicProfile(client, username, {
    signal: request.signal,
  });

  if (result.ok) {
    const body: ProfileResponseBody = {
      profile: result.profile,
      failure: null,
      rateLimit: result.rateLimit,
    };

    return Response.json(body, { status: 200 });
  }

  const { reason, message, retryAfterMs } = result.failure;
  const status = STATUS_BY_REASON[reason];

  const body: ProfileResponseBody = {
    profile: null,
    // `detail` is intentionally dropped: it carries GitHub's raw wording and is
    // for server logs, not for the browser.
    failure: { reason, message, retryAfterMs },
    rateLimit: result.rateLimit,
  };

  return Response.json(body, {
    status,
    // A rate-limited client can tell the browser exactly when to come back,
    // which keeps a retry from consuming the remaining budget.
    headers: retryAfterMs === null
      ? undefined
      : { "retry-after": String(Math.ceil(retryAfterMs / 1000)) },
  });
}