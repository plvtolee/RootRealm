/**
 * RootRealm — the leaderboard's server boundary (TASKS 16.6).
 *
 * ```text
 * a signed-in request → the season's published state, or an opt-in decision
 * ```
 *
 * The screen reads the season here, and the one control it owns — a developer's
 * own participation — is applied here. Nothing about a season's ladder is decided
 * in the browser: the rules are the server's, and a developer may only change the
 * consent that belongs to them.
 */
import { userIdFromCookieHeader } from "../shop/service";
import { githubLoginForUserId } from "../auth/account";
import { accountStore } from "../db/stores";

import { SEASONS, seasonAt } from "./definition";
import { optInToSeason, withdrawFromSeason } from "./optin";
import { seasonStore, type SeasonStore } from "./store";
import { computeLeaderboardView, type LeaderboardViewState } from "./view";
import { assertServerOnly } from "../github/server-only";
import { buildProfilePreview } from "../profile/service";
import { countedActivity, runSafeguards } from "./antifarm";
import { eligibilityFor } from "./eligibility";
import { participationFor } from "./optin";
import { pointsForSeasonEvent, rankStandingAt, type RankStanding } from "./rank";

/** The shared store, held on `globalThis` like the wallet's (see `store.ts`). */
export const seasons: SeasonStore = seasonStore();

/**
 * The season a moment falls in.
 *
 * Null when none does — the honest answer for the gap between seasons, where the
 * screen says so rather than inventing a ladder.
 */
export function currentSeason(at: Date) {
  return seasonAt(SEASONS, at);
}

/**
 * The leaderboard's state for one viewer at a moment.
 *
 * The viewer is a GitHub login, because that is what standings are keyed by
 * (TASKS 16.3). A null viewer yields the rules and an empty ladder, never a
 * fabricated row.
 */
export async function leaderboardStateFor(input: {
  readonly at: Date;
  readonly viewerLogin?: string | null;
  readonly viewerEvents?: readonly import("../developer-event").DeveloperEvent[];
}): Promise<LeaderboardViewState | null> {
  assertServerOnly("leaderboardStateFor");

  const season = currentSeason(input.at);
  if (season === null) return null;

  const consents = await seasons.consents();
  const standings = await seasons.standings(season.id);

  return computeLeaderboardView({
    season,
    standings,
    consents,
    at: input.at,
    viewerLogin: input.viewerLogin ?? null,
    viewerEvents: input.viewerEvents ?? [],
  });
}

/**
 * Computes and publishes the signed-in viewer's current standing when eligible.
 *
 * Publishing is deliberately a server operation: the browser cannot submit
 * fabricated events or a rank total. The standing is recomputed from the same
 * public GitHub evidence used by the profile preview, checked against consent
 * and anti-farming rules, then appended to the season store.
 */
export async function publishViewerStanding(input: {
  readonly viewerLogin: string | null;
  readonly at: Date;
}): Promise<RankStanding | null> {
  assertServerOnly("publishViewerStanding");

  if (input.viewerLogin === null) return null;

  const season = currentSeason(input.at);
  if (season === null) return null;

  const consents = await seasons.consents();
  const participation = participationFor(consents, season, input.viewerLogin);
  if (!participation.participating) return null;

  const preview = await buildProfilePreview(input.viewerLogin);
  if (!preview.ok) return null;

  const standing = rankStandingAt({
    developerLogin: input.viewerLogin,
    events: preview.preview.events,
    at: input.at,
    seasons: [season],
    season,
  });
  if (standing === null) return null;

  const activity = countedActivity(
    preview.preview.events,
    season,
    (event) => pointsForSeasonEvent(event, season),
  );
  const safeguards = runSafeguards(activity, input.at);
  const eligibility = eligibilityFor({
    season,
    developerLogin: input.viewerLogin,
    events: preview.preview.events,
    participating: true,
    safeguardsPass: safeguards.passed,
  });

  if (!eligibility.eligible) return null;

  await seasons.publish(standing);
  return standing;
}

/**
 * Records or withdraws the viewer's consent for the current season.
 *
 * Returns null when there is no current season, so the caller can say "there is
 * no season to join" rather than writing a consent for a season that does not
 * exist.
 */
export async function setViewerParticipation(input: {
  readonly developerLogin: string;
  readonly participating: boolean;
  readonly at: Date;
}): Promise<string | null> {
  assertServerOnly("setViewerParticipation");

  const season = currentSeason(input.at);
  if (season === null) return null;

  const current = await seasons.consents();
  const next = input.participating
    ? optInToSeason(current, {
        season,
        developerLogin: input.developerLogin,
        recordedAt: input.at.toISOString(),
      })
    : withdrawFromSeason(current, {
        season,
        developerLogin: input.developerLogin,
        recordedAt: input.at.toISOString(),
      });

  await seasons.saveConsents(next);
  return season.id;
}

/**
 * The signed-in viewer's GitHub login, from the session cookie.
 *
 * The cookie contains a RootRealm user id because that is the authorization
 * identity. Season records are keyed by GitHub login, so the account lookup is
 * required before the leaderboard boundary can read or write them.
 */
export async function githubLoginFromCookieHeader(header: string | null): Promise<string | null> {
  const userId = userIdFromCookieHeader(header);
  if (userId === null) return null;

  return githubLoginForUserId(userId, accountStore());
}

/** The signed-in viewer's raw RootRealm user id, from the session cookie. */
export { userIdFromCookieHeader };
