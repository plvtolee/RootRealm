/**
 * RootRealm — the skill tree's view model (TASKS 6.6).
 *
 * ```text
 * SKILL_DEFINITIONS + events + learnedIds → SkillTreeState (for the UI)
 * ```
 *
 * TASKS 6.6 asks to replace mock skill data with real progression state, and says
 * the visual tree must only consume domain state. This module is that bridge: it
 * derives the state the UI renders from `evaluateAllProgress`, rather than letting
 * the screen re-derive eligibility itself.
 *
 * ## Why a separate module rather than calling `evaluateAllProgress` directly
 *
 * `evaluateAllProgress` returns `SkillProgress` per node — current, required,
 * status, prerequisites, evidence. That is domain state, and it is what the UI
 * needs. But it is not *shaped* for the UI:
 *
 * - the UI wants one flat map of node views, keyed by id;
 * - it wants `canLearn` / `canRefund` and the *reasons* they are unavailable, as
 *   copy strings rather than structured data;
 * - it wants the point ledger (spent / left).
 *
 * Re-deriving all of that inside the screen would violate the task's constraint,
 * and would re-implement the eligibility rules 6.1–6.5 spent five tasks getting
 * right. So the derivation lives here, in one place, and the screen renders it.
 *
 * ## What is deliberately not here
 *
 * - **No mutation.** This is a pure function of its inputs. Learning a node and
 *   refunding it are the screen's job (via `unlock` / `refund`), and keeping those
 *   separate means a render cannot change state.
 * - **No eligibility logic.** Every field this returns is already decided by
 *   6.1–6.5. If a rule changes, it changes there, and the tree follows.
 *
 * ## The screen's data flow
 *
 * The screen holds the events and the learned ids, and computes this view with
 * `useMemo`. Learning a node calls `unlock` to get the next learned set, then
 * `setLearnedIds` — the view recomputes from the same events. That keeps the
 * events as the single source of truth for evidence, and the learned set as the
 * single source of truth for ownership.
 */
import type { DeveloperEvent } from "../developer-event";
import { SKILL_DEFINITIONS } from "./catalog";
import { indexSkills, type SkillDefinition } from "./definition";
import { evaluateAllProgress, type AttributeTotals, type SkillNodeStatus } from "./progress";
import { SKILL_NODE_PRESENTATION } from "../../components/skill-tree/skill-node-presentation";

/**
 * One node's view for the UI.
 *
 * The `node` is domain state (`SkillDefinition`). `progress` is domain state
 * derived by 6.4. The remaining fields are presentation, resolved by the screen
 * from a separate overlay so the tree consumes domain state for progression and
 * presentation data for cosmetics — never the reverse.
 */
export interface SkillNodeView {
  node: SkillDefinition;
  status: "locked" | "in-progress" | "eligible" | "learned";
  /** Evidence progress, derived by 6.4. */
  progress: { current: number; required: number };
  /** OR-prerequisites not yet learned. */
  missingPrerequisiteIds: readonly string[];
  /** `Learn` may run right now (eligible AND affordable). */
  canLearn: boolean;
  /** Why `Learn` is unavailable — null when available. */
  learnReason: string | null;
  /** `Refund` may run: learned, not the Origin, nothing stranded. */
  canRefund: boolean;
  /** Why `Refund` is unavailable — null when available. */
  refundReason: string | null;
}

/** Display text for each node status. */
export const STATUS_LABEL: Record<SkillNodeStatus, string> = {
  locked: "Locked",
  "in-progress": "In progress",
  eligible: "Eligible",
  learned: "Unlocked",
};

/**
 * Presentation-only fields for a node.
 *
 * Kept separate from `SkillNodeView` so progression never depends on cosmetics:
 * `effects` and `flavor` are copy, `visualX`/`visualY` are canvas coordinates, and
 * `xpReward`/`codeCoinReward` are display values for rewards the §29 CodeCoins
 * phase does not yet define. A node missing from this map still renders — it
 * just shows no flavour text, which is the honest default.
 */
export interface SkillNodePresentation {
  /** One-line flavour text for the detail panel. */
  readonly flavor: string;
  readonly effects: readonly string[];
  readonly visualX: number;
  readonly visualY: number;
  readonly xpReward: number;
  readonly codeCoinReward: number;
  readonly icon: string;
}

/** The whole tree's state for one learned set. */
export interface SkillTreeState {
  learnedIds: ReadonlySet<string>;
  spentPoints: number;
  pointsLeft: number;
  nodes: ReadonlyMap<string, SkillNodeView>;
}

/**
 * Derives the tree's state for the UI.
 *
 * Pure: a render cannot change it, and two identical inputs produce identical
 * output. The catalog, events and learned ids are the only inputs, so the state
 * is fully determined by domain data plus the persisted learned set.
 */
export function computeSkillTreeView(
  learnedIds: Iterable<string>,
  events: readonly DeveloperEvent[],
  options: {
    attributeTotals?: AttributeTotals;
  } = {},
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

    const missingPrerequisiteIds = node.prerequisiteIds.filter(
      (id) => !learned.has(id),
    );

    const canLearn =
      entry.status === "eligible" && spentPoints + node.cost <= SKILL_POINT_BUDGET;

    const canRefund =
      learned.has(node.id) && node.id !== "origin" && !strandedByRefund(node, learned);

    nodes.set(entry.skillId, {
      node,
      status: entry.status,
      progress: { current: entry.current, required: entry.required },
      missingPrerequisiteIds,
      canLearn,
      learnReason: deriveLearnReason(entry, node, spentPoints, learned),
      canRefund,
      refundReason: deriveRefundReason(node, learned),
    });
  }

  return {
    learnedIds: learned,
    spentPoints,
    pointsLeft: SKILL_POINT_BUDGET - spentPoints,
    nodes,
  };
}

/**
 * Presentation data for every node, keyed by skill id.
 *
 * Reads from `SKILL_NODE_PRESENTATION` rather than deriving from the domain
 * catalog, because the domain deliberately omits these fields. A node missing
 * from the map still renders — it shows no flavour text, which is the honest
 * default.
 */
export function computeSkillNodePresentation(): ReadonlyMap<
  string,
  SkillNodePresentation
> {
  const presentation = new Map<string, SkillNodePresentation>();

  for (const [skillId, data] of Object.entries(SKILL_NODE_PRESENTATION)) {
    presentation.set(skillId, {
      flavor: data.effects.join(" "),
      effects: data.effects,
      visualX: data.visualX,
      visualY: data.visualY,
      xpReward: data.xpReward,
      codeCoinReward: data.codeCoinReward,
      icon: data.icon,
    });
  }

  return presentation;
}

/**
 * Why `Learn` is unavailable, as a sentence the detail panel can render.
 *
 * Copy lives here rather than in the component so it can be tested and so a
 * change to the wording does not require touching the screen.
 */
function deriveLearnReason(
  entry: { status: string; current: number; required: number },
  node: SkillDefinition,
  spentPoints: number,
  learned: ReadonlySet<string>,
): string | null {
  if (learned.has(node.id)) return "Already learned.";

  if (entry.status === "locked") {
    const missing = node.prerequisiteIds
      .filter((id) => !learned.has(id))
      .map((id) => indexSkills(SKILL_DEFINITIONS).get(id)?.title ?? id);

    return `Requires ${missing.join(" or ")}.`;
  }

  if (entry.status === "in-progress") {
    return `Evidence pending — ${entry.current} of ${entry.required} verified.`;
  }

  if (spentPoints + node.cost > SKILL_POINT_BUDGET) {
    return "Not enough skill points left.";
  }

  return null;
}

/**
 * Whether refunding `node` would strand any learned node that depends on it.
 *
 * A node is stranded if no *other* learned prerequisite still satisfies it. The
 * Origin cannot strand anything because it has no prerequisites.
 */
function strandedByRefund(
  node: SkillDefinition,
  learned: ReadonlySet<string>,
): boolean {
  for (const candidate of SKILL_DEFINITIONS) {
    if (!learned.has(candidate.id)) continue;
    if (candidate.id === node.id) continue;
    if (!candidate.prerequisiteIds.includes(node.id)) continue;

    const hasOtherRoute = candidate.prerequisiteIds.some(
      (preId) => preId !== node.id && learned.has(preId),
    );

    if (!hasOtherRoute) return true;
  }

  return false;
}

/**
 * Why `Refund` is unavailable, as a sentence.
 *
 * `null` when it is available. The Origin is permanent — refunding it would
 * disconnect every branch from the root, and the whole tree depends on that.
 */
function deriveRefundReason(
  node: SkillDefinition,
  learned: ReadonlySet<string>,
): string | null {
  if (!learned.has(node.id)) return null;
  if (node.id === "origin") return "The Origin is permanent.";
  if (strandedByRefund(node, learned)) {
    const index = indexSkills(SKILL_DEFINITIONS);
    const stranded = SKILL_DEFINITIONS.find(
      (candidate) =>
        learned.has(candidate.id) &&
        candidate.id !== node.id &&
        candidate.prerequisiteIds.includes(node.id) &&
        !candidate.prerequisiteIds.some(
          (preId) => preId !== node.id && learned.has(preId),
        ),
    );

    return `${stranded ? index.get(stranded.id)?.title : "A skill"} depends on this skill.`;
  }

  return null;
}

/**
 * The skill point budget.
 *
 * Named here rather than read from the mock so the real budget lives with the real
 * catalog. 22 points is the prototype's budget, unchanged.
 */
export const SKILL_POINT_BUDGET = 22;
