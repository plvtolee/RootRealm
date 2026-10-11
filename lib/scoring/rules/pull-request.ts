/**
 * RootRealm — pull request scoring (TASKS 5.3).
 *
 * `SCORING.md` §8: a merged pull request is worth `+30 XP`, because "a
 * qualifying merged PR represents shipped implementation work". The PR must be
 * attributable to the developer, successfully merged, backed by a stable GitHub
 * source, and not previously rewarded.
 *
 * ## What the evidence can and cannot say
 *
 * TASKS 4.4 verified that `payload.pull_request` is a five-field stub —
 * `{ url, id, number, head, base }` — with **no** `additions`, `deletions`,
 * `changed_files`, `draft`, `title` or `user`. So §8's "shipped implementation
 * work" cannot be measured by size, and this rule deliberately does not try.
 * Merge is the signal, which is the better one anyway: §8 rewards a PR that
 * landed, not one that was large.
 *
 * §8 also notes "additional PR-related activity may contribute to other
 * attributes through separate rules" — so this rule awards Builder and only
 * Builder. Size and review-derived attributes are not invented here.
 *
 * ## Why `merged` being `null` matters
 *
 * `DeveloperEvent` carries `evidence.merged` as `true` only for a positive
 * `merged` action, `false` for a positive non-merge action, and `null` when the
 * action cannot decide — which is the `closed` case, where GitHub does not say
 * whether the closure was a merge. That `null` is load-bearing:
 *
 * - `true` → award;
 * - `false` → declined, and we *know* it was not merged (`not_qualifying`);
 * - `null` → declined, but we cannot tell (`insufficient_evidence`).
 *
 * Flattening `null` to `false` — the obvious simplification — would report a
 * merge as a definite non-merge and lose the distinction §35 keeps between
 * declining evidence and lacking it.
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
import {
  additionalRegressionTestAward,
  regressionTestXp,
} from "./regression-test";
import type { ScoreResult, ScoringVersion } from "../types";

export const RULE_ID = "pr.merged";

/** Narrows to a pull request event with its evidence. */
function pullRequestOf(event: DeveloperEvent) {
  return event.kind === "pull_request" ? event.evidence : null;
}

export const pullRequestRule: ScoringRule = {
  ruleId: RULE_ID,

  evaluate(event: DeveloperEvent, version: ScoringVersion): ScoreResult | null {
    const evidence = pullRequestOf(event);
    if (evidence === null) return null;

    const classification = "merged_pull_request" as const;

    // §5 rule 3 / §6 — "attributable to the developer".
    if (!attributable(event)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The pull request could not be attributed to this developer from GitHub's own evidence.",
        rejectionReason: "not_attributable",
      });
    }

    // §8 "backed by a stable GitHub source". The PR number is what makes the
    // evidence citable and its URL buildable; the event id alone is not enough
    // to point anyone at the work.
    if (!hasReference(evidence.number)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The pull request carried no number, so it cannot be cited as a stable source.",
        rejectionReason: "insufficient_evidence",
      });
    }

    // §8 "successfully merged". Three outcomes, not two — see the module header.
    if (evidence.merged === null) {
      return reject({
        event,
        version,
        classification,
        reason:
          "GitHub did not record whether this pull request was merged; a closed pull request can be merged or abandoned.",
        rejectionReason: "insufficient_evidence",
      });
    }

    if (evidence.merged === false) {
      // A PullRequestEvent also fires for `labeled`, `assigned`, `reopened` and
      // similar (per the documented payload), so the reason must not assert a
      // closure that did not happen.
      const action = evidence.action?.toLowerCase() ?? null;
      const wasClosed = action === "closed";

      return reject({
        event,
        version,
        classification,
        reason: wasClosed
          ? "The pull request was closed without being merged."
          : `A pull request "${action ?? "unknown"}" action is not a merge.`,
        rejectionReason: "not_qualifying",
      });
    }

    const xp = version.xp.merged_pull_request;

    // §13's regression-test line, folded into this award rather than issued as a
    // second transaction: §18's idempotency key is scoped to the event, so a
    // second award for the same pull request would collide on the same primary
    // key. See the regression-test module header for why it cannot be its own
    // rule.
    const regressionTest = additionalRegressionTestAward(
      evidence,
      regressionTestXp(version),
    );

    return award({
      event,
      version,
      ruleId: RULE_ID,
      classification,
      xp,
      reason:
        regressionTest === null
          ? "Merged implementation pull request"
          : "Merged implementation pull request including a regression test",
      // §14, via the central table.
      attributes: attributeUnitsFor(classification),
      additional:
        regressionTest === null ? undefined : [regressionTest],
    });
  },
};
