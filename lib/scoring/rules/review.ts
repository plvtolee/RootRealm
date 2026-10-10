/**
 * RootRealm — review scoring (TASKS 5.4).
 *
 * `SCORING.md` §9: a completed review is `+15 XP`. It "should represent an actual
 * GitHub pull-request review event", and §9 names Collaborator as the primary
 * attribute, adding that reviews "may contribute to other attributes only if
 * explicitly defined" — so this rule awards Collaborator and nothing else.
 *
 * ## Why a review comment is not a completed review
 *
 * `PullRequestReviewEvent` and `PullRequestReviewCommentEvent` both normalise to
 * the `review` kind (TASKS 4.5), because they are the same family of
 * contribution and share a pull request. They are not the same *award*, though:
 *
 * - a **review** is a submitted judgement — approved, changes requested, or a
 *   review body §9's "completed review" describes;
 * - a **review comment** is one remark on a diff. It carries no verdict.
 *
 * §9 says "completed review", so only the former qualifies. The distinction is
 * preserved as `evidence.subject` precisely so a rule can make this call rather
 * than having the two collapsed at ingestion.
 *
 * ## The anti-farming gap this rule cannot close
 *
 * §9 requires that reviews "avoid rewarding repetitive or meaningless
 * self-generated activity", and §21 lists "self-generated review loops" among the
 * patterns to reject. Detecting one needs the **pull request's** author — a
 * developer reviewing their own PR in a loop is the pattern — and the review
 * payload does not carry it: `payload.pull_request` is the five-field stub from
 * TASKS 4.4, and `payload.review` describes the review, not the PR.
 *
 * So this rule cannot detect a self-review, and does not pretend to. It is
 * recorded here rather than silently omitted, and closing it needs either the
 * PR author (a further fetch) or a stateful per-PR cap, which belongs to
 * persistence (TASKS 10.x) rather than to a pure rule. §21's own list separates
 * "duplicate event rejection" from the anti-farming rules for exactly this
 * reason: the first is stateless, the second is not.
 *
 * ## Why a dismissed or pending review is declined
 *
 * `DISMISSED` reviews were superseded, and `PENDING` ones were never submitted.
 * Neither is a completed contribution, so neither is `not_qualifying` — as
 * opposed to an unknown state, which is `insufficient_evidence`.
 */
import type { DeveloperEvent } from "../../developer-event";
import {
  attributable,
  award,
  hasReference,
  reject,
  type ScoringRule,
} from "../rule";
import type { ScoreResult, ScoringVersion } from "../types";

export const RULE_ID = "review.completed";

/**
 * Review states that are not a completed contribution.
 *
 * A `pending` review was never submitted. `dismissed` is handled as an *action*
 * rather than a state — see the note in the rule — but is checked here too,
 * because a review can also carry it as its state.
 */
const NON_QUALIFYING_STATES: ReadonlySet<string> = new Set([
  "dismissed",
  "pending",
]);

export const reviewRule: ScoringRule = {
  ruleId: RULE_ID,

  evaluate(event: DeveloperEvent, version: ScoringVersion): ScoreResult | null {
    if (event.kind !== "review") return null;

    const evidence = event.evidence;
    const classification = "completed_review" as const;

    // §5 rule 3 / §6 — attributable to the developer.
    if (!attributable(event)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The review could not be attributed to this developer from GitHub's own evidence.",
        rejectionReason: "not_attributable",
      });
    }

    // §8's "stable GitHub source" applies equally here: a review without a pull
    // request number cannot be cited.
    if (!hasReference(evidence.number)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The review carried no pull request number, so it cannot be cited as a stable source.",
        rejectionReason: "insufficient_evidence",
      });
    }

    // §9 "an actual GitHub pull-request review event". A review comment carries
    // no verdict, so it is a different contribution from a completed review.
    if (evidence.subject === "comment") {
      return reject({
        event,
        version,
        classification,
        reason:
          "A review comment is a remark on a diff, not a completed review.",
        rejectionReason: "not_qualifying",
      });
    }

    // No state means the review recorded no outcome, so it is not "completed".
    if (evidence.state === null) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The review recorded no outcome, so it is not a completed review.",
        rejectionReason: "insufficient_evidence",
      });
    }

    // Dismissal is the event's *action*, not the review's state: dismissing sets
    // the action to `dismissed` while the review's own state can remain
    // `approved`. Checking only the state would award a dismissed review as a
    // completed one — verified against the documented payload.
    if (evidence.action !== null && evidence.action.toLowerCase() === "dismissed") {
      return reject({
        event,
        version,
        classification,
        reason: "The review was dismissed and no longer stands.",
        rejectionReason: "not_qualifying",
      });
    }

    if (NON_QUALIFYING_STATES.has(evidence.state.toLowerCase())) {
      return reject({
        event,
        version,
        classification,
        reason: `A ${evidence.state.toLowerCase()} review is not a completed contribution.`,
        rejectionReason: "not_qualifying",
      });
    }

    return award({
      event,
      version,
      ruleId: RULE_ID,
      classification,
      xp: version.xp.completed_review,
      reason: "Completed pull request review",
      // §9: Collaborator, and §14 lists "completed PR reviews" as its primary
      // evidence.
      attributes: [{ attribute: "collaborator", amount: 1 }],
    });
  },
};
