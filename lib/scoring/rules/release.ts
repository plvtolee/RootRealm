/**
 * RootRealm — release scoring (TASKS 5.6).
 *
 * `SCORING.md` §11: a release is `+25 XP`, awarded to Maintainer — §14 lists
 * "releases" as its primary evidence — for a "qualifying repository release event
 * attributable to the developer".
 *
 * ## Which action is a release
 *
 * The Events API documents exactly one action for this event type — "Can be
 * `published`" — so this rule accepts that and declines everything else. The
 * reasoning behind the declines still matters, because the *webhook* form of the
 * same event carries more actions and the payload shape is otherwise identical:
 *
 * | action | what happened | qualifies |
 * | --- | --- | --- |
 * | `published` | a release went out | yes |
 * | `created` | a **draft** was saved | no |
 * | `edited` | an existing release's text changed | no |
 * | `deleted` | the release was removed | no |
 * | `unpublished` | a publish was reverted | no |
 *
 * Declining is the right default for a system that awards XP: `created` is not
 * published, `edited` is a revision of something already counted, and
 * `deleted`/`unpublished` describe a withdrawal. Awarding any of them would
 * credit shipping for the act of not shipping, and admitting a new action later
 * should be a deliberate edit rather than an accident of a permissive set.
 *
 * This is why TASKS 4.5's `ReleaseEvidence` needed `action` added — without it
 * the canonical event could not tell a publish from an edit, and the rule would
 * have had to award every release event identically.
 *
 * ## Prereleases
 *
 * §11 does not distinguish them, and a prerelease is shipped work that users can
 * install, so one qualifies. The flag is carried into the reason rather than
 * silently dropped, so an explanation can say which it was.
 *
 * ## Duplicates
 *
 * §11: "Repeated or duplicate observations of the same release must not award
 * additional XP." That is enforced elsewhere rather than here — TASKS 4.6
 * collapses repeated observations of one event, and TASKS 5.11 gates the award
 * on an idempotency key. A pure rule has no memory and cannot do it itself,
 * which is precisely why the guarantee is split across those two layers.
 */
import type { DeveloperEvent } from "../../developer-event";
import { attributeUnitsFor } from "../attributes";
import {
  attributable,
  award,
  hasReference,
  reject,
  type ScoringRule,
} from "../rule";
import type { ScoreResult, ScoringVersion } from "../types";

export const RULE_ID = "release.published";

/**
 * Actions that put something out, as opposed to revising or withdrawing it.
 *
 * The Events API documents exactly one value — "Can be `published`" — so that is
 * the set. The others are handled defensively rather than optimistically: a
 * rewarding system should decline an unrecognised action and say so, not award on
 * a guess, and adding one later is then a deliberate edit to this set.
 */
const PUBLISHING_ACTIONS: ReadonlySet<string> = new Set(["published"]);

export const releaseRule: ScoringRule = {
  ruleId: RULE_ID,

  evaluate(event: DeveloperEvent, version: ScoringVersion): ScoreResult | null {
    if (event.kind !== "release") return null;

    const evidence = event.evidence;
    const classification = "release" as const;

    if (!attributable(event)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The release could not be attributed to this developer from GitHub's own evidence.",
        rejectionReason: "not_attributable",
      });
    }

    // §11 requires a qualifying *release* event; a tag is what makes it citable
    // and its URL buildable.
    if (!hasReference(evidence.tag)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The release carried no tag, so it cannot be cited as a stable source.",
        rejectionReason: "insufficient_evidence",
      });
    }

    // A missing action is missing evidence; a known non-publishing action is
    // declined evidence. §35 draws that distinction and it is worth keeping.
    if (evidence.action === null) {
      return reject({
        event,
        version,
        classification,
        reason:
          "GitHub did not report what happened to this release, so it cannot be confirmed as a publication.",
        rejectionReason: "insufficient_evidence",
      });
    }

    if (!PUBLISHING_ACTIONS.has(evidence.action.toLowerCase())) {
      return reject({
        event,
        version,
        classification,
        reason: `A release "${evidence.action.toLowerCase()}" action is not a publication.`,
        rejectionReason: "not_qualifying",
      });
    }

    // Belt and braces: a draft is by definition not published, so a payload
    // claiming both is contradictory and should not be awarded on.
    if (evidence.draft === true) {
      return reject({
        event,
        version,
        classification,
        reason: "The release is still a draft, so it has not been published.",
        rejectionReason: "not_qualifying",
      });
    }

    return award({
      event,
      version,
      ruleId: RULE_ID,
      classification,
      xp: version.xp.release,
      reason: evidence.prerelease === true
        ? "Published a prerelease"
        : "Published a release",
      // §11: "Releases contribute primarily to: Maintainer". Resolved through the
      // central table.
      attributes: attributeUnitsFor(classification),
    });
  },
};
