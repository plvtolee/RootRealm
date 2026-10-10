/**
 * RootRealm — `GET /api/github/profile` (TASKS 4.2).
 *
 * The server boundary for a guest profile lookup. It is deliberately thin: it
 * passes the one input to the ingestion service and translates the result into
 * an HTTP status. It holds no GitHub knowledge — no header parsing, no
 * retrying, no field validation — because all of that belongs to
 * `lib/github/client.ts`, and duplicating it here would be the second place to
 * update when GitHub changes.
 *
 * The client is constructed per request on purpose. The token is read from the
 * server environment and never leaves this process; the browser only ever sees
 * the fields in {@link ProfileResponseBody}.
 */
import { statusForReason, type FailureReason } from "@/lib/github/failure";
import {
  createProfileClient,
  fetchPublicProfile,
  type PublicProfile,
} from "@/lib/github/profile";
import type { RateLimitState } from "@/lib/github/rate-limit";

/** No caching: a lookup is a live read, and the budget is already rate-limited. */
export const dynamic = "force-dynamic";

interface ProfileResponseBody {
  profile: PublicProfile | null;
  failure: {
    reason: FailureReason;
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

  const body: ProfileResponseBody = {
    profile: null,
    // `detail` is intentionally dropped: it carries GitHub's raw wording and is
    // for server logs, not for the browser.
    failure: { reason, message, retryAfterMs },
    rateLimit: result.rateLimit,
  };

  return Response.json(body, {
    status: statusForReason(reason),
    // A rate-limited client can tell the browser exactly when to come back,
    // which keeps a retry from consuming the remaining budget.
    headers: retryAfterMs === null
      ? undefined
      : { "retry-after": String(Math.ceil(retryAfterMs / 1000)) },
  });
}