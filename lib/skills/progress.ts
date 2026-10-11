/**
 * RootRealm — skill progress (TASKS 6.4).
 *
 * ```text
 * prerequisites (6.2) + evidence (6.3) + learned set (6.5) → progress + status
 * ```
 *
 * TASKS 6.4 asks for three numbers per node: current progress, required
 * progress, status. All three are **derived**, never stored — `DATA_CONTRACT`
 * §6 is explicit that eligibility is derived from domain state, and a stored
 * status would let the record disagree with the state it claims to summarise.
 *
 * ## Why status is a matrix and not a single score
 *
 * The obvious implementation collapses the two gates into one number — a
 * percentage, or `current >= required`. That loses the distinction the screen
 * exists to show, because `SCORING.md` §26 names them separately:
 *
 * ```text
 * prerequisite skills
 * category progress
 * evidence requirements
 * required progress
 * ```
 *
 * A node can be blocked for two quite different reasons, and a developer asks a
 * different question in each case:
 *
 * | Prerequisites | Evidence | Status | What the player needs to be told |
 * | --- | --- | --- | --- |
 * | not met | any | `locked` | *which* prerequisite is missing (6.2) |
 * | met | short | `in-progress` | how much evidence is left (6.3) |
 * | met | met | `eligible` | nothing — it is ready to be learned |
 * | — | — | `learned` | nothing — already owned (6.5) |
 *
 * Collapsing the first two into "not eligible" would make a node that is
 * *permanently* blocked look identical to one that is one contribution short,
 * and the fix for each is completely different.
 *
 * ## `learned` is an input, not an output
 *
 * This module reads the learned set; it does not persist it. That is TASKS 6.5's
 * job, and the split matters: a pure function that also owned records would have
 * to guess at storage, and 6.5 would then be unable to test uniqueness without
 * re-implementing progress on top.
 *
 * ## `attribute_units` is resolved here, not in 6.3
 *
 * `evidence.ts` returns 0 for an `attribute_units` requirement because it is not
 * an event count — it is the attribute-progress axis, which comes from scoring
 * rather than from events. This module takes the totals as an input, so a node
 * requiring "3 Builder units" resolves against the developer's actual attribute
 * progress rather than being permanently unsatisfiable.
 *
 * That resolution is also the reason a node cannot be met from XP alone: the
 * totals carry attribute units, and `SCORING.md` §26's "must not be unlocked
 * solely from global XP" is enforced by the units being a separate axis, not by
 * this module checking anything.
 *
 * ## The Origin has no requirement and no progress
 *
 * `current` and `required` are both 0 and the evidence gate is trivially met.
 * That is a deliberate reading: the Origin is granted on a connected account,
 * not on accumulated work, so "0 of 0" is the honest description rather than a
 * fiction like "1 of 1".
 */
import type { DeveloperEvent } from "../developer-event";
import type { Attribute } from "../scoring/types";
import { computeAllEvidence, type EvidenceCounts } from "./evidence";
import {
  evaluateAll,
  evaluatePrerequisites,
  type PrerequisiteMap,
  type PrerequisiteResult,
} from "./prerequisites";
import {
  describeRequirement,
  requirementCount,
  type EvidenceRequirement,
  type SkillDefinition,
  type SkillIndex,
} from "./definition";

/** The four node states, matching the prototype's `SkillNodeStatus`. */
export type SkillNodeStatus = "locked" | "in-progress" | "eligible" | "learned";

/** Attribute progress, keyed by attribute. Absent keys read as zero. */
export type AttributeTotals = Readonly<Partial<Record<Attribute, number>>>;

/** Everything needed to derive progress for one node. */
export interface SkillProgress {
  readonly skillId: string;
  /** Evidence units held toward this node's requirement. */
  readonly current: number;
  /** What the node requires. Always an integer (`SCORING.md` §16). */
  readonly required: number;
  readonly status: SkillNodeStatus;
  /** The prerequisite gate's answer, so a UI need not recompute it. */
  readonly prerequisites: PrerequisiteResult;
  /** Whether the evidence gate is met. */
  readonly evidenceMet: boolean;
  /** A one-line description of what is required, safe to render. */
  readonly requirementText: string;
}

/**
 * Resolves a requirement against the developer's attribute progress.
 *
 * Split from `evaluateRequirement` because that function answers "how many
 * qualifying *events* do I have?", and an attribute unit is not an event. For
 * every other kind it delegates; for `attribute_units` it reads the totals.
 */
export function resolveRequirement(
  requirement: EvidenceRequirement,
  counts: EvidenceCounts,
  attributeTotals: AttributeTotals,
): number {
  if (requirement.kind === "attribute_units") {
    return attributeTotals[requirement.attribute] ?? 0;
  }

  // Every other kind is an event count, read from the tally the caller already
  // computed rather than re-walking the events.
  return countFromCounts(requirement, counts);
}

/** The count for a requirement, read from an already-computed tally. */
function countFromCounts(
  requirement: EvidenceRequirement,
  counts: EvidenceCounts,
): number {
  switch (requirement.kind) {
    case "merged_pull_requests":
      return counts.merged_pull_requests;
    case "completed_reviews":
      return counts.completed_reviews;
    case "linked_issue_closures":
      return counts.linked_issue_closures_total;
    case "published_releases":
      return counts.published_releases;
    case "qualifying_documentation":
      return counts.qualifying_documentation;
    case "verified_regression_tests":
      return counts.verified_regression_tests;
    case "landed_pushes":
      return counts.landed_pushes;
    case "attribute_units":
      // Handled by the caller; reaching here means a node declared an
      // attribute requirement without a totals map.
      return 0;
  }
}

/** Derives progress for one node. */
export function evaluateProgress(
  node: SkillDefinition,
  input: {
    prerequisites: PrerequisiteMap;
    counts: EvidenceCounts;
    attributeTotals: AttributeTotals;
    learnedIds: ReadonlySet<string>;
  },
): SkillProgress {
  const prerequisites =
    input.prerequisites.get(node.id) ??
    evaluatePrerequisites(node, input.learnedIds);

  const requirement = node.requirement;
  // The Origin has no requirement: 0 of 0, not a fiction like 1 of 1.
  const required = requirement === null ? 0 : requirementCount(requirement);
  const current =
    requirement === null
      ? 0
      : resolveRequirement(requirement, input.counts, input.attributeTotals);

  // Progress is clamped to the requirement: 5 merged PRs against a node needing
  // 3 is not 167%, it is 3 of 3 and one surplus PR.
  const held = Math.max(0, Math.min(current, required));
  const evidenceMet = required === 0 || held >= required;

  const isLearned = input.learnedIds.has(node.id);

  let status: SkillNodeStatus;
  if (isLearned) status = "learned";
  else if (!prerequisites.satisfied) status = "locked";
  else if (!evidenceMet) status = "in-progress";
  else status = "eligible";

  return {
    skillId: node.id,
    current: held,
    required,
    status,
    prerequisites,
    evidenceMet,
    requirementText:
      requirement === null ? "A connected GitHub account" : describeRequirement(requirement),
  };
}

/** Derives progress for every node, in catalog order. */
export function evaluateAllProgress(
  definitions: readonly SkillDefinition[],
  events: readonly DeveloperEvent[],
  options: {
    attributeTotals?: AttributeTotals;
    learnedIds?: Iterable<string>;
  } = {},
): readonly SkillProgress[] {
  const learned = new Set(options.learnedIds ?? []);
  const prerequisites = evaluateAll(definitions, learned);
  const counts = computeAllEvidence(events);

  return definitions.map((node) =>
    evaluateProgress(node, {
      prerequisites,
      counts,
      attributeTotals: options.attributeTotals ?? {},
      learnedIds: learned,
    }),
  );
}

/** Progress by skill id, for a UI that looks nodes up rather than iterating. */
export function progressById(
  definitions: readonly SkillDefinition[],
  events: readonly DeveloperEvent[],
  options: {
    attributeTotals?: AttributeTotals;
    learnedIds?: Iterable<string>;
  } = {},
): ReadonlyMap<string, SkillProgress> {
  return new Map(
    evaluateAllProgress(definitions, events, options).map((progress) => [
      progress.skillId,
      progress,
    ]),
  );
}

/**
 * The nodes that could be learned right now.
 *
 * "Right now" means every gate passes and it is not already learned. Deliberately
 * not called "unlockable": TASKS 6.5 owns whether a node *is* unlocked, and this
 * answers only whether it may be, which keeps a UI from presenting eligibility
 * as a persisted record.
 */
export function eligibleNodes(
  progress: readonly SkillProgress[],
): readonly SkillProgress[] {
  return progress.filter((entry) => entry.status === "eligible");
}

/**
 * Whether a developer has every prerequisite and all the evidence for a node.
 *
 * A convenience over {@link evaluateProgress} for a single question, and — like
 * `prerequisitesMet` in 6.2 — it does not claim the node is unlocked.
 */
export function isEligible(
  node: SkillDefinition,
  index: SkillIndex,
  events: readonly DeveloperEvent[],
  options: {
    attributeTotals?: AttributeTotals;
    learnedIds?: Iterable<string>;
  } = {},
): boolean {
  // A node the catalog does not define cannot be learned, and returning false is
  // more useful than throwing: a UI looking up an id from a URL should show
  // "not eligible", not crash.
  if (node === undefined) return false;

  const [progress] = evaluateAllProgress([node], events, options);

  return progress?.status === "eligible";
}