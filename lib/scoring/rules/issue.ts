/**
 * RootRealm — issue closure scoring (TASKS 5.5).
 *
 * `SCORING.md` §10: a linked issue closure is `+20 XP`, and the rules are
 * pointed:
 *
 * - "The event must represent a qualifying issue closure associated with the
 *   developer's work";
 * - "Do not award XP simply because the developer closed an arbitrary issue
 *   without sufficient evidence";
 * - "Where possible, retain the source issue URL".
 *
 * ## Which attribute, and why §10 does not say
 *
 * §10 names no attribute. §14 assigns issue evidence to *two* attributes:
 * Debugger's primary evidence includes "linked bug fixes", and Maintainer's
 * includes "issue triage". Those are genuinely different acts, and the
 * distinction between them is observable:
 *
 * - closing an issue **you opened** is fixing your own reported defect →
 *   Debugger;
 * - closing an issue **someone else opened** is triage of incoming reports →
 *   Maintainer.
 *
 * `evidence.authored` is exactly that fact, and it exists because TASKS 4.5
 * computed it for this purpose. So this rule splits the award on authorship
 * rather than guessing one attribute for both — a single guess would either
 * credit triage to Debugger or count a self-fix as stewardship, and §14 gives no
 * basis for either.
 *
 * ## Why an unknown author declines
 *
 * §10 is unusually firm that an arbitrary closure must not be rewarded "without
 * sufficient evidence". When GitHub omits the issue author, neither attribute can
 * be justified — and silently defaulting to one would be the arbitrary award §10
 * forbids. So it declines as `insufficient_evidence`.
 *
 * ## Why only the closing action qualifies
 *
 * An `IssuesEvent` fires for labelling, assigning and commenting on an issue too,
 * and a closed issue can be labelled long after it was closed. So the event's
 * *action* is checked rather than the issue's current `state`: the state says the
 * issue is closed, the action says this event is the closure.
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

export const RULE_ID = "issue.closed";

export const issueRule: ScoringRule = {
  ruleId: RULE_ID,

  evaluate(event: DeveloperEvent, version: ScoringVersion): ScoreResult | null {
    if (event.kind !== "issue") return null;

    const evidence = event.evidence;
    const classification = "linked_issue_closure" as const;

    if (!attributable(event)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The issue closure could not be attributed to this developer from GitHub's own evidence.",
        rejectionReason: "not_attributable",
      });
    }

    // §10 "retain the source issue URL" — the number is what makes the closure
    // citable and its URL buildable.
    if (!hasReference(evidence.number)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The issue carried no number, so the closure cannot be cited as a stable source.",
        rejectionReason: "insufficient_evidence",
      });
    }

    // The event's action, not the issue's state: labelling a closed issue is not
    // a closure, and the state cannot tell them apart.
    if (evidence.action !== "closed") {
      return reject({
        event,
        version,
        classification,
        reason: `An issue "${evidence.action ?? "unknown"}" action is not a closure.`,
        rejectionReason: "not_qualifying",
      });
    }

    // §10 "without sufficient evidence". Authorship is what justifies either
    // attribute, so an unknown author justifies neither.
    if (evidence.authored === null) {
      return reject({
        event,
        version,
        classification,
        reason:
          "GitHub did not report the issue's author, so the closure cannot be classified as a fix or as triage.",
        rejectionReason: "insufficient_evidence",
      });
    }

    return award({
      event,
      version,
      ruleId: RULE_ID,
      classification,
      xp: version.xp.linked_issue_closure,
      // §14 splits issue evidence between Debugger and Maintainer on whether the
      // issue was the developer's own, and the reason names which it was — from
      // the same fact the mapping used, so the copy and the attribute it
      // describes cannot drift apart.
      reason:
        evidence.authored === true
          ? "Closed an issue the developer had opened"
          : "Closed an issue reported by someone else",
      attributes: attributeUnitsFor(classification, {
        issueAuthored: evidence.authored,
      }),
    });
  },
};
