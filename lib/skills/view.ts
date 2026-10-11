/**
 * RootRealm — the skill tree's view model (TASKS 6.6).
 *
 * ```text
 * SKILL_DEFINITIONS + events + learnedIds → SkillTreeState (for the UI)
 * ```
 *
 * The tree consumes this module, not the prototype's mock data. Every
 * progression field here is decided by 6.1–6.5; this module only shapes it for
 * the UI and words the reasons a control is unavailable. Presentation (position,
 * copy, glyph) is not here — it lives in `components/skill-tree/skill-node-presentation.ts`
 * and is looked up by id at render time.
 *
 * Pure: the same inputs always produce the same state, and nothing here mutates.
 * Learning and refunding are the screen's job, through `unlock` and `refund`.
 */
import type { DeveloperEvent } from "../developer-event";
import { SKILL_DEFINITIONS } from "./catalog";
import { indexSkills, type SkillDefinition } from "./definition";
import { evaluateAllProgress, type AttributeTotals, type SkillNodeStatus } from "./progress";

/** The skill point budget. The catalog's costs are sized against this. */
export const SKILL_POINT_BUDGET = 22;

/** One node's view for the UI. */
export interface SkillNodeView {
  node: SkillDefinition;
  status: SkillNodeStatus;
  /** Evidence progress, derived by 6.4. */
  progress: { current: number; required: number };
  /** OR-prerequisites not yet learned. */
  missingPrerequisiteIds: readonly string[];
  /** `Learn` may run now: eligible and affordable. */
  canLearn: boolean;
  /** Why `Learn` is unavailable. Null when available. */
  learnReason: string | null;
  /** `Refund` may run: learned, not the Origin, and nothing stranded. */
  canRefund: boolean;
  /** Why `Refund` is unavailable. Null when available. */
  refundReason: string | null;
}

/** Display text for each node status. */
export const STATUS_LABEL: Record<SkillNodeStatus, string> = {
  locked: "Locked",
  "in-progress": "In progress",
  eligible: "Eligible",
  learned: "Unlocked",
};

/** The whole tree's state for one learned set. */
export interface SkillTreeState {
  learnedIds: ReadonlySet<string>;
  spentPoints: number;
  pointsLeft: number;
  nodes: ReadonlyMap<string, SkillNodeView>;
}

/** Derives the tree's state for the UI from the catalog, events and learned ids. */
export function computeSkillTreeView(
  learnedIds: Iterable<string>,
  events: readonly DeveloperEvent[],
  options: { attributeTotals?: AttributeTotals } = {},
): SkillTreeState {
  const learned = new Set(learnedIds);
  const index = indexSkills(SKILL_DEFINITIONS);
  const progress = evaluateAllProgress(SKILL_DEFINITIONS, events, {
    attributeTotals: options.attributeTotals,
    learnedIds: learned,
  });

  let spentPoints = 0;
  for (const id of learned) {
    spentPoints += index.get(id)?.cost ?? 0;
  }

  const nodes = new Map<string, SkillNodeView>();

  for (const entry of progress) {
    const node = index.get(entry.skillId);
    if (node === undefined) continue;

    nodes.set(entry.skillId, {
      node,
      status: entry.status,
      progress: { current: entry.current, required: entry.required },
      missingPrerequisiteIds: node.prerequisiteIds.filter((id) => !learned.has(id)),
      canLearn:
        entry.status === "eligible" && spentPoints + node.cost <= SKILL_POINT_BUDGET,
      learnReason: learnReason(entry.status, node, index, spentPoints, learned),
      canRefund: learned.has(node.id) && node.id !== "origin" && !strandedByRefund(node, learned),
      refundReason: refundReason(node, index, learned),
    });
  }

  return {
    learnedIds: learned,
    spentPoints,
    pointsLeft: SKILL_POINT_BUDGET - spentPoints,
    nodes,
  };
}

/** Why `Learn` is unavailable, as a sentence. Null when it is available. */
function learnReason(
  status: SkillNodeStatus,
  node: SkillDefinition,
  index: ReadonlyMap<string, SkillDefinition>,
  spentPoints: number,
  learned: ReadonlySet<string>,
): string | null {
  if (learned.has(node.id)) return "Already learned.";

  if (status === "locked") {
    const missing = node.prerequisiteIds
      .filter((id) => !learned.has(id))
      .map((id) => index.get(id)?.title ?? id);
    return `Requires ${missing.join(" or ")}.`;
  }

  if (status === "in-progress") {
    return "Evidence pending.";
  }

  if (spentPoints + node.cost > SKILL_POINT_BUDGET) {
    return "Not enough skill points left.";
  }

  return null;
}

/**
 * Whether refunding `node` would strand a learned node. A dependant is stranded
 * when no other learned prerequisite still satisfies it.
 */
function strandedByRefund(node: SkillDefinition, learned: ReadonlySet<string>): boolean {
  return strandedDependant(node, learned) !== undefined;
}

function strandedDependant(
  node: SkillDefinition,
  learned: ReadonlySet<string>,
): SkillDefinition | undefined {
  return SKILL_DEFINITIONS.find(
    (candidate) =>
      learned.has(candidate.id) &&
      candidate.id !== node.id &&
      candidate.prerequisiteIds.includes(node.id) &&
      !candidate.prerequisiteIds.some((preId) => preId !== node.id && learned.has(preId)),
  );
}

/** Why `Refund` is unavailable, as a sentence. Null when it is available. */
function refundReason(
  node: SkillDefinition,
  index: ReadonlyMap<string, SkillDefinition>,
  learned: ReadonlySet<string>,
): string | null {
  if (!learned.has(node.id)) return null;
  if (node.id === "origin") return "The Origin is permanent.";

  const dependant = strandedDependant(node, learned);
  if (dependant !== undefined) {
    return `${index.get(dependant.id)?.title ?? "A skill"} depends on this skill.`;
  }

  return null;
}
