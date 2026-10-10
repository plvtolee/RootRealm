/**
 * RootRealm — documentation scoring (TASKS 5.7).
 *
 * `SCORING.md` §12: qualifying documentation is `+10 XP`, awarded to Scholar —
 * §14 lists "qualifying documentation" as its primary evidence. §12 is explicit
 * about the risk: "Documentation must be classified as meaningful qualifying
 * work rather than simply any textual change", and it adds that "the
 * qualification rules should become more precise as the data model matures".
 *
 * ## What the evidence can and cannot distinguish
 *
 * A `GollumEvent` reports which wiki pages changed and whether each was
 * **created** or **edited**. It reports nothing else — no diff, no size, no text.
 * So the distinction §12 asks for has to be drawn from creation versus edit,
 * because that is the entire vocabulary available.
 *
 * This rule therefore qualifies a **page creation** and declines a change that is
 * only edits:
 *
 * - creating a page is authoring documentation — unambiguously the "meaningful
 *   qualifying work" §12 wants;
 * - editing one may be a typo fix or a rewrite, and with no size to go on the
 *   two are indistinguishable. §12's warning is precisely about granting XP for
 *   changes whose substance cannot be established, so the conservative reading is
 *   to decline and say why rather than to award and hope.
 *
 * The cost is real and worth stating: a maintainer who substantially rewrites a
 * wiki page earns nothing here. What would fix it is the page's `sha` — commit
 * metadata that could be turned into a size — which needs a further fetch. Until
 * then, declining is the honest half of §12's requirement, and §12's own note
 * that the rules should sharpen as the model matures anticipates exactly this.
 *
 * ## One award per event, not per page
 *
 * A single event can touch several pages. It is one act of work, so it earns one
 * award: §12 gives a flat value with no per-page multiplier, and awarding per
 * page would reward a bulk rename as though it were several documents.
 */
import type { DeveloperEvent } from "../../developer-event";
import { attributeUnitsFor } from "../attributes";
import { attributable, award, reject, type ScoringRule } from "../rule";
import type { ScoreResult, ScoringVersion } from "../types";

export const RULE_ID = "docs.created";

export const documentationRule: ScoringRule = {
  ruleId: RULE_ID,

  evaluate(event: DeveloperEvent, version: ScoringVersion): ScoreResult | null {
    if (event.kind !== "documentation") return null;

    const evidence = event.evidence;
    const classification = "qualifying_documentation" as const;

    if (!attributable(event)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The wiki change could not be attributed to this developer from GitHub's own evidence.",
        rejectionReason: "not_attributable",
      });
    }

    // No pages at all means the payload said nothing about what changed, which
    // is missing evidence rather than unworthy work.
    if (evidence.pagesChanged === 0) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The wiki event reported no pages, so there is no documentation work to qualify.",
        rejectionReason: "insufficient_evidence",
      });
    }

    // §12: a change of unstated substance is not "meaningful qualifying work".
    if (evidence.pagesCreated === 0) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The wiki event only edited existing pages, and an edit's substance cannot be established from the payload.",
        rejectionReason: "not_qualifying",
      });
    }

    return award({
      event,
      version,
      ruleId: RULE_ID,
      classification,
      xp: version.xp.qualifying_documentation,
      reason:
        evidence.pagesCreated === 1
          ? "Created a wiki page"
          : `Created ${evidence.pagesCreated} wiki pages`,
      // §12 names Scholar as documentation's primary attribute. Resolved through
      // the central table.
      attributes: attributeUnitsFor(classification),
    });
  },
};
