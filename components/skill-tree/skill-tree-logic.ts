/**
 * RootRealm — skill tree progression logic (TASKS §2.3 states, §6.2 reference).
 *
 * Pure functions over `skill-tree-data.ts`: no React, no rendering, no
 * persistence. The screen calls `computeSkillTreeState` each time the learned
 * set changes and everything else — eligibility, affordability, refund
 * blocking, cheapest-path preview — falls out of `prerequisiteIds` alone
 * (DATA_CONTRACT §16: `visualX`/`visualY` never influence eligibility).
 *
 * Prerequisite semantics are OR: a node unlocks when ANY one of its
 * `prerequisiteIds` is learned (an empty list means no requirement — only the
 * Origin has that). Evidence is a second, independent gate: prerequisites
 * satisfied but `progress < requiredProgress` is the in-progress state
 * (DESIGN_SYSTEM §17), and in the prototype evidence never advances.
 */

import {
  SKILL_NODE_BY_ID,
  SKILL_NODES,
  SKILL_POINT_BUDGET,
  type SkillNode,
  type SkillNodeStatus,
} from "./skill-tree-data";

/** Status vocabulary shown to the user (DESIGN_SYSTEM §17 wording). */
export const STATUS_LABEL: Record<SkillNodeStatus, string> = {
  locked: "Locked",
  "in-progress": "In progress",
  eligible: "Eligible",
  learned: "Unlocked",
};

/** One node's derived per-user view — everything the UI needs to render it. */
export type SkillNodeView = {
  node: SkillNode;
  status: SkillNodeStatus;
  /** OR-prerequisites not yet learned (the requirement list is built from these). */
  missingPrerequisiteIds: readonly string[];
  /** `Learn` may run right now (eligible AND affordable). */
  canLearn: boolean;
  /** Why `Learn` is unavailable — panel copy, null when it is available/learned. */
  learnReason: string | null;
  /** `Refund` may run: learned, not the Origin, and nothing would be stranded. */
  canRefund: boolean;
  /** Why `Refund` is unavailable — panel copy, null when it is available. */
  refundReason: string | null;
};

/** The whole tree's state for one learned set. */
export type SkillTreeState = {
  learnedIds: ReadonlySet<string>;
  spentPoints: number;
  pointsLeft: number;
  nodes: ReadonlyMap<string, SkillNodeView>;
};

/** OR-prerequisite check: any one learned satisfies the requirement. */
function prerequisitesMet(node: SkillNode, learned: ReadonlySet<string>): boolean {
  return node.prerequisiteIds.length === 0 || node.prerequisiteIds.some((id) => learned.has(id));
}

/**
 * Learned ids that would lose their connection to the Origin if `removedId`
 * were refunded — computed on the simulated set (learned − removedId).
 *
 * A learned node stays stable only through a chain of learned, stable
 * prerequisites ending at a prereq-less node (the Origin). The recursion
 * memoises per call and guards against cycles, though the content graph is
 * acyclic by construction.
 */
function orphanedAfterRefund(learned: ReadonlySet<string>, removedId: string): string[] {
  const remaining = new Set(learned);
  remaining.delete(removedId);

  const memo = new Map<string, boolean>();
  const onStack = new Set<string>();

  function stable(id: string): boolean {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const node = SKILL_NODE_BY_ID.get(id);
    if (!node) {
      memo.set(id, false);
      return false;
    }
    if (node.prerequisiteIds.length === 0) {
      memo.set(id, true);
      return true;
    }
    if (onStack.has(id)) return false;
    onStack.add(id);
    const ok = node.prerequisiteIds.some((preId) => remaining.has(preId) && stable(preId));
    onStack.delete(id);
    memo.set(id, ok);
    return ok;
  }

  return [...remaining].filter((id) => !stable(id));
}

/** Title of the learned node that blocks a refund, preferring a direct dependent. */
function refundBlockerTitle(blockers: readonly string[], removedId: string): string {
  const direct = blockers.find((id) =>
    (SKILL_NODE_BY_ID.get(id)?.prerequisiteIds ?? []).includes(removedId),
  );
  const blockerId = direct ?? blockers[0];
  return SKILL_NODE_BY_ID.get(blockerId)?.title ?? blockerId;
}

/**
 * Derive every node's state, the point ledger and the action gates for one
 * learned set. This is the single entry point the screen renders from.
 */
export function computeSkillTreeState(learnedIds: Iterable<string>): SkillTreeState {
  const learnedIdsSet = new Set(learnedIds);

  let spentPoints = 0;
  for (const id of learnedIdsSet) spentPoints += SKILL_NODE_BY_ID.get(id)?.cost ?? 0;
  const pointsLeft = SKILL_POINT_BUDGET - spentPoints;

  const nodes = new Map<string, SkillNodeView>();
  for (const node of SKILL_NODES) {
    const isLearned = learnedIdsSet.has(node.id);
    const met = prerequisitesMet(node, learnedIdsSet);
    const missingPrerequisiteIds = node.prerequisiteIds.filter((id) => !learnedIdsSet.has(id));

    let status: SkillNodeStatus;
    if (isLearned) status = "learned";
    else if (!met) status = "locked";
    else if (node.progress < node.requiredProgress) status = "in-progress";
    else status = "eligible";

    let learnReason: string | null = null;
    if (!isLearned && status === "locked") {
      const titles = missingPrerequisiteIds.map((id) => SKILL_NODE_BY_ID.get(id)?.title ?? id);
      learnReason = `Requires ${titles.join(" or ")}.`;
    } else if (!isLearned && status === "in-progress") {
      learnReason = `Evidence pending — ${node.progress} of ${node.requiredProgress} verified.`;
    } else if (status === "eligible" && pointsLeft < node.cost) {
      learnReason = "Not enough skill points left.";
    }

    let canRefund = false;
    let refundReason: string | null = null;
    if (isLearned) {
      if (node.id === "origin") {
        refundReason = "The Origin is permanent.";
      } else {
        const blockers = orphanedAfterRefund(learnedIdsSet, node.id);
        if (blockers.length === 0) {
          canRefund = true;
        } else {
          refundReason = `${refundBlockerTitle(blockers, node.id)} depends on this skill.`;
        }
      }
    }

    nodes.set(node.id, {
      node,
      status,
      missingPrerequisiteIds,
      canLearn: status === "eligible" && pointsLeft >= node.cost,
      learnReason,
      canRefund,
      refundReason,
    });
  }

  return { learnedIds: learnedIdsSet, spentPoints, pointsLeft, nodes };
}

/**
 * Learn `id` from the current state. Returns the next learned id list, or null
 * when the action is unavailable — callers also disable the control from
 * `SkillNodeView.canLearn`, so null is never a surprise.
 */
export function learnNode(state: SkillTreeState, id: string): readonly string[] | null {
  if (!state.nodes.get(id)?.canLearn) return null;
  return [...state.learnedIds, id];
}

/**
 * Refund `id` back into the point pool. Returns the next learned id list, or
 * null when blocked (`SkillNodeView.canRefund` + `refundReason` drive the UI).
 */
export function refundNode(state: SkillTreeState, id: string): readonly string[] | null {
  if (!state.nodes.get(id)?.canRefund) return null;
  return [...state.learnedIds].filter((learnedId) => learnedId !== id);
}

/** Preview of the cheapest route to a target: unlearned ids in order, target last. */
export type SkillPathPreview = {
  nodeIds: readonly string[];
  points: number;
  reachable: boolean;
};

/**
 * Cheapest-path preview to `targetId` (TASKS §2.5): the minimum-cost chain of
 * OR-prerequisites from the current learned frontier. Evidence is assumed to
 * complete along the way (in-progress nodes are passable), so a preview can
 * name nodes that are not learnable right now — the panel says so explicitly.
 *
 * Ties keep prerequisite-array order, which prefers each branch's own side
 * route over a bridge detour by construction.
 */
export function cheapestPathTo(state: SkillTreeState, targetId: string): SkillPathPreview {
  const target = SKILL_NODE_BY_ID.get(targetId);
  if (!target) return { nodeIds: [], points: 0, reachable: false };
  if (state.learnedIds.has(targetId)) return { nodeIds: [], points: 0, reachable: true };

  const memo = new Map<string, { points: number; nodeIds: string[] } | null>();
  const onStack = new Set<string>();

  function solve(id: string): { points: number; nodeIds: string[] } | null {
    if (memo.has(id)) return memo.get(id) ?? null;
    const node = SKILL_NODE_BY_ID.get(id);
    if (!node) return null;
    if (state.learnedIds.has(id)) {
      const hit = { points: 0, nodeIds: [] as string[] };
      memo.set(id, hit);
      return hit;
    }
    if (onStack.has(id)) return null;
    onStack.add(id);
    let best: { points: number; nodeIds: string[] } | null = null;
    if (node.prerequisiteIds.length === 0) {
      best = { points: 0, nodeIds: [] };
    } else {
      for (const prereqId of node.prerequisiteIds) {
        const via = solve(prereqId);
        if (via && (best === null || via.points < best.points)) best = via;
      }
    }
    onStack.delete(id);
    const result =
      best === null ? null : { points: best.points + node.cost, nodeIds: [...best.nodeIds, id] };
    memo.set(id, result);
    return result;
  }

  const solved = solve(targetId);
  if (!solved) return { nodeIds: [], points: 0, reachable: false };
  return { nodeIds: solved.nodeIds, points: solved.points, reachable: true };
}

