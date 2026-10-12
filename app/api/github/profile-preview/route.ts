/**
 * RootRealm — `GET /api/github/profile-preview` (TASKS 8.2, 19.1, 19.2).
 *
 * The server boundary for the public profile preview. It is deliberately thin:
 * one input in, one service call, one HTTP status out. All the ingestion,
 * normalization, scoring and aggregation knowledge lives in
 * `lib/profile/service.ts`, so the route cannot drift from the module it exposes.
 *
 * The preview is computed per request and stored nowhere — persistence is
 * Phase 10 — which is why the route is dynamic.
 *
 * ## Security (19.1, 19.2)
 *
 * The route answers through `safeJson`, which checks the response against every
 * credential this process holds. The preview is the one route that calls GitHub
 * with `GITHUB_TOKEN` in hand, which makes it the one route where an echo is
 * possible — so it is the one that most needs the check.
 *
 * The username is validated against GitHub's own shape before it is used: a
 * 64-character or non-alphanumeric login is a 400 rather than a wasted upstream
 * request and a confusing 404.
 */
import { statusForReason } from "@/lib/github/failure";
import { errorStateFor } from "@/lib/github/error-states";
import { buildProfilePreview } from "@/lib/profile/service";
import { parseGitHubLogin, safeJson } from "@/lib/security/server";

export const dynamic = "force-dynamic";

/** `GET /api/github/profile-preview?username=<login>`. */
export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("username");
  const parsed = parseGitHubLogin(raw);

  if (!parsed.ok) {
    return safeJson(
      {
        preview: null,
        failure: {
          reason: "invalid_username",
          message: "That is not a GitHub username.",
          retryAfterMs: null,
        },
        rateLimit: null,
      },
      { status: 400 },
    );
  }

  const result = await buildProfilePreview(parsed.login, { signal: request.signal });

  if (!result.ok) {
    const { reason, retryAfterMs } = result.failure;
    return safeJson(
      {
        preview: null,
        failure: {
          reason,
          // The browser renders copy from `errorStateFor`, so the API and the UI
          // cannot describe one reason two different ways.
          message: errorStateFor(reason, retryAfterMs).message,
          retryAfterMs,
        },
        rateLimit: result.failure.rateLimit,
      },
      {
        status: statusForReason(reason),
        headers: retryAfterMs === null
          ? undefined
          : { "retry-after": String(Math.ceil(retryAfterMs / 1000)) },
      },
    );
  }

  return safeJson(
    {
      preview: result.preview,
      failure: null,
      rateLimit: result.preview.rateLimit,
    },
    { status: 200 },
  );
}