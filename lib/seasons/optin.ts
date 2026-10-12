/**
 * RootRealm — leaderboard opt-in (TASKS 16.2).
 *
 * ```text
 * (season, developer) → an explicit consent, or an absence of one
 * ```
 *
 * SCORING.md §30 requires the ranking system to be "opt-in". The word doing the
 * work is *explicit*: a developer who never expressed a preference is not on the
 * ladder. Absence of a record is not consent, so the default here is
 * `not_participating` and joining is the only way in.
 *
 * ## Why consent is per season
 *
 * A single global toggle would make leaving a season's ladder impossible without
 * also leaving every future one — and would make a developer who opted in during
 * one season automatically rankable in the next, which is a decision nobody made
 * for them. Consent is recorded per `(seasonId, login)`, and a new season starts
 * everyone out again.
 *
 * ## Why leaving is as easy as joining
 *
 * `withdrawFromSeason` exists so opting out is a first-class operation rather than
 * a support request. A ranking system people cannot leave is not opt-in in any
 * sense the word can survive.
 */
import type { Season } from "./definition";

/** One developer's participation record for one season. */
export interface SeasonConsent {
  readonly seasonId: string;
  readonly developerLogin: string;
  readonly participating: boolean;
  /** ISO-8601, when the record was made. */
  readonly recordedAt: string;
  /** The evidence the developer saw when they chose: the season's rules id. */
  readonly rulesId: string;
}

/** Why a developer is not on the ladder, when they are not. */
export type ParticipationRefusal =
  /** No record: absence of consent is not consent. */
  | "no_consent"
  /** A record that withdrew. */
  | "withdrawn"
  /** The season requires opt-in and this developer never gave it. */
  | "not_opted_in";

/** Whether a developer may be ranked, and why not when they may not. */
export type Participation =
  | { readonly participating: true; readonly consent: SeasonConsent }
  | { readonly participating: false; readonly refusal: ParticipationRefusal };

/**
 * A participation record, or null when the developer has never been asked.
 *
 * Null is the honest answer for "no record": it is what makes the default
 * non-participating, and collapsing it into a synthetic withdrawal would lose the
 * difference between someone who said no and someone who was never asked.
 */
export function consentFor(
  records: readonly SeasonConsent[],
  seasonId: string,
  developerLogin: string,
): SeasonConsent | null {
  return (
    records.find(
      (record) => record.seasonId === seasonId && record.developerLogin === developerLogin,
    ) ?? null
  );
}

/** Records consent to be ranked in a season. Idempotent on `(season, developer)`. */
export function optInToSeason(
  records: readonly SeasonConsent[],
  input: { readonly season: Season; readonly developerLogin: string; readonly recordedAt: string },
): readonly SeasonConsent[] {
  const consent: SeasonConsent = {
    seasonId: input.season.id,
    developerLogin: input.developerLogin,
    participating: true,
    recordedAt: input.recordedAt,
    rulesId: input.season.id,
  };

  return [...records.filter((r) => !sameSlot(r, consent)), consent];
}

/** Withdraws consent. The record stays, marked withdrawn — the choice is a fact. */
export function withdrawFromSeason(
  records: readonly SeasonConsent[],
  input: { readonly season: Season; readonly developerLogin: string; readonly recordedAt: string },
): readonly SeasonConsent[] {
  return optInToSeason(records, input).map((record) =>
    sameSlot(record, {
      seasonId: input.season.id,
      developerLogin: input.developerLogin,
    })
      ? { ...record, participating: false }
      : record,
  );
}

/**
 * Whether a developer's standing may be published for a season.
 *
 * The single gate every publication path goes through — the leaderboard, a
 * snapshot, an export — so "who is on the ladder" has one answer rather than one
 * per caller.
 */
export function participationFor(
  records: readonly SeasonConsent[],
  season: Season,
  developerLogin: string,
): Participation {
  const consent = consentFor(records, season.id, developerLogin);

  if (consent === null) {
    return season.eligibility.requiresOptIn
      ? { participating: false, refusal: "no_consent" }
      : { participating: false, refusal: "not_opted_in" };
  }

  if (!consent.participating) {
    return { participating: false, refusal: "withdrawn" };
  }

  return { participating: true, consent };
}

/** Filters a set of logins to those whose standing may be published. */
export function participatingDevelopers(
  records: readonly SeasonConsent[],
  season: Season,
  logins: readonly string[],
): readonly string[] {
  return logins.filter((login) => participationFor(records, season, login).participating);
}

function sameSlot(
  record: SeasonConsent,
  other: { readonly seasonId: string; readonly developerLogin: string },
): boolean {
  return record.seasonId === other.seasonId && record.developerLogin === other.developerLogin;
}