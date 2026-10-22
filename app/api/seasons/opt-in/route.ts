/**
 * RootRealm — `POST /api/seasons/opt-in` (TASKS 16.2 and 16.6).
 *
 * The one control the leaderboard screen owns: a developer's own participation in
 * the current season. The body says whether they want to be ranked and nothing
 * else — the season comes from the clock and the developer from the session, so a
 * request cannot join someone else into a season.
 */
import {
  githubLoginFromCookieHeader,
  publishViewerStanding,
  setViewerParticipation,
} from "@/lib/seasons/service";

export const dynamic = "force-dynamic";

/** `POST /api/seasons/opt-in` — `{ participating: boolean }`. */
export async function POST(request: Request): Promise<Response> {
  const developerLogin = await githubLoginFromCookieHeader(request.headers.get("cookie"));
  if (developerLogin === null) {
    return Response.json(
      { error: "unauthenticated", message: "Sign in with GitHub to change participation." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const participating = (body as { participating?: unknown } | null)?.participating;
  if (typeof participating !== "boolean") {
    return Response.json(
      { error: "bad_request", message: "Send { participating: boolean } as JSON." },
      { status: 400 },
    );
  }

  const at = new Date();
  const seasonId = await setViewerParticipation({ developerLogin, participating, at });

  if (seasonId === null) {
    return Response.json(
      { error: "no_active_season", message: "There is no season running right now." },
      { status: 409 },
    );
  }

  // GitHub evidence is read only after an explicit participation change, never
  // on every leaderboard navigation.
  if (participating) {
    await publishViewerStanding({ viewerLogin: developerLogin, at });
  }

  return Response.json({ participating, seasonId }, { status: 200 });
}
