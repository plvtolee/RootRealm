/**
 * RootRealm — push scoring (TASKS 5.2).
 *
 * `SCORING.md` §7 awards `+3 XP` for a qualifying commit and warns twice about
 * the same thing: "The scoring system must avoid rewarding large amounts of
 * trivial commit activity", and "Do not reward every commit in a long repetitive
 * sequence without considering farming controls."
 *
 * ## Why this scores pushes, not commits
 *
 * TASKS 4.4 verified against the live API that a `PushEvent` carries **no commit
 * list** — no message, no files, no author, no count. A push reports `ref`,
 * `head` and `before`, and nothing else. §7's unit is therefore unobservable, and
 * scoring it would mean multiplying by a count we do not have.
 *
 * So this rule awards §7's value per *push*, under the name `qualifying_push`
 * rather than `qualifying_commit`. The naming is the point: an award labelled
 * "commit" would assert a granularity the data does not carry, which is the same
 * mistake as calling the event kind `commit`.
 *
 * ## What actually qualifies a push
 *
 * §7 lists candidate signals — "repository context", "event relationships",
 * "whether the commit is part of a qualifying change", "duplication/repetition
 * checks" — and the available vocabulary is three fields. That rules out some of
 * them entirely and narrows the rest:
 *
 * | §7 signal | available? | what this rule does |
 * | --- | --- | --- |
 * | repository context | partly | requires a confirmed repository (§6 `verified`) |
 * | event relationships | no | a push carries no PR, issue or release reference |
 * | part of a qualifying change | no | would need the commit list or a diff |
 * | duplication / repetition | yes | declines a no-op push, and §18 handles repeats |
 *
 * So the qualification is deliberately thin, and the rule says so in its
 * explanation rather than dressing a thin signal up as a rich one.
 *
 * ## The no-op check is the anti-farming control we can actually afford
 *
 * §7's repetition warning is partly answerable. A push where `head === before`
 * moved no code — GitHub emits these when a branch is force-pushed to the same
 * commit, or when a tag or branch event fires with no content change. Awarding
 * for those would be exactly the "trivial activity" §7 prohibits, and they are
 * detectable from two SHA comparisons with no extra requests.
 *
 * What this rule still **cannot** detect is the case §7 actually warns about: a
 * single push containing a long repetitive sequence of trivial commits. The
 * commit list that would reveal it does not exist in this data. That limit is
 * named here rather than papered over, and the conservative direction is chosen
 * — a flat award per push means splitting work into more pushes cannot multiply
 * the score, which is the half of the farming problem that *is* fixable.
 *
 * ## Overlap with pull requests, accepted deliberately
 *
 * A merged pull request was almost always pushed first, so both events appear in
 * the feed and both qualify. This rule awards both. The overlap is real, and it
 * is accepted rather than worked around:
 *
 * - Suppressing it would need the repository's default branch inside every
 *   scoring rule, since a push to `main` is the merge and a push to `feature` is
 *   usually its input. Rules currently see one event with no repository context,
 *   so that is a structural change, not a line of code.
 * - §4's own values place this well: `+3` against a merge's `+30`, so the merge
 *   still dominates and the overlap cannot invert the balance.
 * - §4 calls its values "starting placeholders for implementation and tuning".
 *   Resolving double-counting against real profiles is tuning work, and doing it
 *   now against a guess would encode a guess.
 *
 * The cost is named rather than hidden: a developer whose work merges pays for
 * the landing twice. If that proves wrong in tuning, the fix is a new scoring
 * version (§3 — history is not rewritten), not an edit to this one.
 *
 * ## Duplicates
 *
 * §7's "duplication/repetition checks" are enforced in the two places that can
 * actually see them: TASKS 4.6 collapses repeated observations of one event, and
 * TASKS 5.11 gates the award on a §18 idempotency key. A pure rule has no memory
 * and cannot do it itself, which is why the guarantee is split across layers
 * rather than claimed here.
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

export const RULE_ID = "push.landed";

/**
 * Whether a push moved any code.
 *
 * `head === before` means the ref did not move: the push landed nothing. GitHub
 * emits these, so declining them is §7's "do not reward trivial activity" made
 * concrete rather than a hypothetical guard.
 *
 * A missing `before` is *not* treated as a no-op. It means GitHub withheld the
 * field, which is missing evidence rather than evidence of no change — §35 draws
 * that distinction and the two are not interchangeable.
 */
function movedCode(evidence: {
  headSha: string | null;
  beforeSha: string | null;
}): boolean {
  if (evidence.headSha === null || evidence.beforeSha === null) return true;
  return evidence.headSha !== evidence.beforeSha;
}

export const pushRule: ScoringRule = {
  ruleId: RULE_ID,

  evaluate(event: DeveloperEvent, version: ScoringVersion): ScoreResult | null {
    if (event.kind !== "push") return null;

    const evidence = event.evidence;
    const classification = "qualifying_push" as const;

    if (!attributable(event)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The push could not be attributed to this developer from GitHub's own evidence.",
        rejectionReason: "not_attributable",
      });
    }

    // Without a head SHA there is no commit to point at, so the award could not
    // cite its evidence (§17 requires a source).
    if (!hasReference(evidence.headSha)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The push carried no head commit, so there is nothing to cite as a source.",
        rejectionReason: "insufficient_evidence",
      });
    }

    // §7's repetition control, as far as two SHAs allow. See the module header
    // for the repetition case this cannot catch.
    if (!movedCode(evidence)) {
      return reject({
        event,
        version,
        classification,
        reason:
          "The push left the branch on the same commit, so no code was landed.",
        rejectionReason: "anti_farming_rule",
      });
    }

    return award({
      event,
      version,
      ruleId: RULE_ID,
      classification,
      xp: version.xp.qualifying_push,
      // The branch is named because it is the one part of a push an explanation
      // can be specific about, and a generic "pushed code" would be true of every
      // award in this rule.
      reason:
        evidence.branch === null
          ? "Landed code"
          : `Landed code on ${evidence.branch}`,
      // §14 Builder: "qualifying implementation work". Resolved through the
      // central table, and `UNAWARDED_ATTRIBUTES` stays empty as a result.
      attributes: attributeUnitsFor(classification),
    });
  },
};