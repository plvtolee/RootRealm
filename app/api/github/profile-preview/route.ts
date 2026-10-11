/**
 * RootRealm — `GET /api/github/profile-preview` (TASKS 8.2).
 *
 * The server boundary for the public profile preview. It is deliberately thin:
 * one input in, one service call, one HTTP status out. All the ingestion,
 * normalization, scoring and aggregation knowledge lives in
 * `lib/profile/service.ts`, so the route cannot drift from the module it exposes.
 *
 * The preview is computed per request and stored nowhere — persistence is
 * Phase 10 — which is why the route is dynamic.
 */
import { statusForReason } from "@/lib/github/failure";
import { errorStateFor } from "@/lib/github/error-states";
import { buildProfilePreview } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

/** `GET /api/github/profile-preview?username=<login>`. */
export async function GET(request: Request): Promise<Response> {
  const username = new URL(request.url).searchParams.get("username") ?? "";

  const result = await buildProfilePreview(username, { signal: request.signal });

  if (!result.ok) {
    const { reason, retryAfterMs } = result.failure;
    return Response.json(
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

  return Response.json(
    {
      preview: result.preview,
      failure: null,
      rateLimit: result.preview.rateLimit,
    },
    { status: 200 },
  );
}