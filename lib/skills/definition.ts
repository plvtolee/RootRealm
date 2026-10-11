/**
 * RootRealm — skill definitions (TASKS 6.1).
 *
 * ```text
 * data contract → typed SkillDefinition[]
 * ```
 *
 * `SCORING.md` §26 is the governing text and it is more specific than it first
 * appears:
 *
 * > Skills must not be unlocked solely from global XP.
 * > A skill node uses: prerequisite skills, category progress, evidence
 * > requirements, required progress.
 *
 * Two of those four are routinely collapsed into a single number, and both
 * collapses are wrong:
 *
 * - **"category progress" is not XP.** `totalXp` is a global pool; a node's
 *   requirement is scoped to the work that proves it. A node requiring 5 merged
 *   pull requests is satisfied by 5 merged pull requests, not by any other route to
 *   the same XP.
 * - **"evidence requirements" is not "required progress".** The first says *what
 *   counts*; the second says *how much of it*. They are separate fields here
 *   because a node requiring "3 releases" and one requiring "3 merged pull
 *   requests" both need 3, and a bare `requiredProgress: 3` could not tell them
 *   apart — let alone tell a UI what to display as the requirement.
 *
 * ## Why `EvidenceRequirement` is a union and not a string
 *
 * The obvious shortcut is a label like `evidence: "5 merged PRs"`. It reads well
 * and enforces nothing: nothing stops it disagreeing with the number beside it,
 * and nothing can check it against the events a developer actually has. A union of
 * measurements cannot be displayed as a sentence by accident, and each variant can
 * later be *counted* from real state — which is what TASKS 6.3 needs.
 *
 * `attributableTo` exists for the same reason as `AttributeKey`: the six branches
 * are `SCORING.md` §14's attributes, so reusing that union means a typo is a
 * compile error and the tree cannot grow a seventh branch by accident.
 *
 * ## What this module deliberately does not contain
 *
 * - **No visual coordinates.** `visualX`/`visualY` are presentation and live in
 *   the tree component. §26 says eligibility "is derived from domain state", and a
 *   pixel is not domain state.
 * - **No `progress`.** The 36-node prototype shipped a static `progress` field per
 *   node, set equal to `requiredProgress` unless hand-tuned so the screen had
 *   something to show. That is mock data shaped like a measurement, and any UI
 *   consuming it would render a fiction. Progress is computed by TASKS 6.4 from
 *   real evidence; `definition` here carries only what is *required*.
 * - **No earned rewards.** `xpReward` and `codeCoinReward` are display values in
 *   the prototype. Whether a node *grants* anything is a §29 CodeCoins decision
 *   this phase does not make.
 *
 * ## `prerequisiteMode` is explicit rather than inferred
 *
 * The prototype's `prerequisiteIds` were always read as OR — "any one learned
 * satisfies it" — which is right for the tree as drawn but is a fact about those
 * 36 nodes, not a law. Making it a field means TASKS 6.2 can evaluate both modes
 * from one code path, and a future node that genuinely needs *all* of its
 * prerequisites says so instead of silently receiving OR.
 */

/** The six branches (`SCORING.md` §14), reused so the tree cannot invent a seventh. */
export type SkillBranch =
  | "builder"
  | "debugger"
  | "scholar"
  | "collaborator"
  | "maintainer"
  | "architect";

/** What kind of node this is. Drives cost and reward defaults. */
export type SkillNodeType = "core" | "keystone" | "notable" | "minor";

/** The five tiers, bottom-up (`DESIGN_SYSTEM` §16). */
export type SkillTier =
  | "roots"
  | "foundation"
  | "intermediate"
  | "advanced"
  | "mastery";

/**
 * Something countable that a skill node can require.
 *
 * Every variant is a *measurement over observed events*, never a label. TASKS 6.3
 * turns each into a predicate over domain state; a variant nothing can evaluate is
 * a requirement that can never be satisfied, and that should be a compile error
 * rather than a permanently locked node discovered in production.
 *
 * `attributeUnits` deserves a note: §16 keeps attribute units separate from XP, so
 * "3 Builder units" and "30 XP" are different requirements even though the first
 * is usually earned alongside the second. Collapsing them would make §26's "must
 * not be unlocked solely from global XP" impossible to enforce — a node requiring
 * attribute units could be satisfied by any XP source that happened to award them.
 */
export type EvidenceRequirement =
  | { readonly kind: "merged_pull_requests"; readonly count: number }
  | { readonly kind: "completed_reviews"; readonly count: number }
  | { readonly kind: "linked_issue_closures"; readonly count: number }
  | { readonly kind: "published_releases"; readonly count: number }
  | { readonly kind: "qualifying_documentation"; readonly count: number }
  | { readonly kind: "verified_regression_tests"; readonly count: number }
  | { readonly kind: "landed_pushes"; readonly count: number }
  | { readonly kind: "attribute_units"; readonly attribute: SkillBranch; readonly count: number };

/** How a node's `prerequisiteIds` combine. See the module header. */
export type PrerequisiteMode = "any" | "all";

export interface SkillDefinition {
  /** Stable identifier. Prerequisite references these, so renaming orphans history. */
  readonly id: string;
  /** Branch this node belongs to, or `null` for the Origin. */
  readonly branch: SkillBranch | null;
  readonly type: SkillNodeType;
  readonly tier: SkillTier;
  readonly title: string;
  readonly description: string;
  /** Skill points this node costs to learn. `0` for the Origin. */
  readonly cost: number;
  /** Prerequisite node ids, combined according to `prerequisiteMode`. */
  readonly prerequisiteIds: readonly string[];
  readonly prerequisiteMode: PrerequisiteMode;
  /**
   * What counts as evidence for this node, and how much.
   *
   * `null` only for the Origin, which `SCORING.md` §26 grants on a connected
   * GitHub identity rather than on accumulated work. Using `null` rather than a
   * zero-count requirement keeps "no requirement" distinct from "requires none
   * of the things we can measure", which would be unreachable.
   */
  readonly requirement: EvidenceRequirement | null;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What is wrong with a skill catalog, or `null` when it is sound.
 *
 * Returned rather than thrown so a caller can report every problem at once. A
 * catalog is data, and data can be edited; failing on the first bad reference
 * would leave an implementer fixing one error per run with no view of the rest.
 */
export interface CatalogProblem {
  readonly nodeId: string;
  readonly problem:
    | "duplicate_id"
    | "unknown_prerequisite"
    | "self_prerequisite"
    | "unreachable_prerequisite"
    | "missing_requirement"
    | "zero_requirement"
    | "negative_cost"
    | "negative_requirement"
    | "multiple_origins";
}

/**
 * Checks a catalog's internal consistency.
 *
 * The rules it enforces are the ones a malformed catalog would break silently:
 * a dangling prerequisite would lock a node forever with no visible cause, a
 * duplicate id would make two nodes indistinguishable to §18's event identity,
 * and a cycle would deadlock progression without any node reporting why.
 */
export function validateCatalog(
  definitions: readonly SkillDefinition[],
): readonly CatalogProblem[] {
  const problems: CatalogProblem[] = [];
  const seen = new Set<string>();
  let origins = 0;

  for (const node of definitions) {
    if (seen.has(node.id)) {
      problems.push({ nodeId: node.id, problem: "duplicate_id" });
      // Every later check keys on the id, so continuing would report cascading
      // problems for a node that does not uniquely exist.
      continue;
    }
    seen.add(node.id);

    if (node.branch === null) origins += 1;

    if (node.cost < 0) {
      problems.push({ nodeId: node.id, problem: "negative_cost" });
    }

    // The Origin is the one node with no evidence requirement; every other node
    // needs one, or it would be satisfiable by any XP whatsoever — the exact
    // outcome §26 forbids.
    if (node.requirement === null) {
      if (node.branch !== null) {
        problems.push({ nodeId: node.id, problem: "missing_requirement" });
      }
    } else if (requirementCount(node.requirement) < 1) {
      problems.push({ nodeId: node.id, problem: "zero_requirement" });
    }

    for (const prerequisiteId of node.prerequisiteIds) {
      if (prerequisiteId === node.id) {
        problems.push({ nodeId: node.id, problem: "self_prerequisite" });
      } else if (!definitions.some((other) => other.id === prerequisiteId)) {
        problems.push({ nodeId: node.id, problem: "unknown_prerequisite" });
      }
    }
  }

  if (origins !== 1) {
    problems.push({ nodeId: "origin", problem: "multiple_origins" });
  }

  return [
    ...problems,
    ...unreachableProblems(definitions, seen),
  ];
}

/**
 * Nodes no sequence of unlocks could ever reach.
 *
 * A cycle is reported once, at the highest-ordered member, rather than once per
 * member — otherwise a three-node cycle reads as three unrelated bugs, which
 * sends an implementer looking for three causes instead of one.
 */
function unreachableProblems(
  definitions: readonly SkillDefinition[],
  known: ReadonlySet<string>,
): CatalogProblem[] {
  /** Resolves every node reachable from the given roots, ignoring mode. */
  const reachableFrom = (roots: readonly string[]): Set<string> => {
    const reached = new Set<string>();
    const queue = [...roots];

    while (queue.length > 0) {
      const id = queue.pop()!;
      if (reached.has(id) || !known.has(id)) continue;
      reached.add(id);

      for (const node of definitions) {
        if (node.prerequisiteIds.includes(id)) queue.push(node.id);
      }
    }

    return reached;
  };

  const origins = definitions.filter((node) => node.branch === null);
  if (origins.length === 0) return [];

  const reachable = reachableFrom(origins.map((node) => node.id));

  return definitions
    .filter((node) => !reachable.has(node.id))
    .map((node) => ({ nodeId: node.id, problem: "unreachable_prerequisite" }));
}

/** The count a requirement asks for, for validation and display. */
export function requirementCount(requirement: EvidenceRequirement): number {
  return requirement.count;
}

/** A one-line description of what a node requires, safe to render. */
export function describeRequirement(
  requirement: EvidenceRequirement | null,
): string {
  if (requirement === null) return "A connected GitHub account";

  const noun: Record<EvidenceRequirement["kind"], string> = {
    merged_pull_requests: "merged pull request",
    completed_reviews: "completed review",
    linked_issue_closures: "linked issue closure",
    published_releases: "published release",
    qualifying_documentation: "qualifying document",
    verified_regression_tests: "verified regression test",
    landed_pushes: "landed push",
    attribute_units: "attribute unit",
  };

  const label = noun[requirement.kind];
  return `${requirement.count} ${label}${requirement.count === 1 ? "" : "s"}`;
}

/** A typed lookup over a catalog, built once rather than per lookup. */
export type SkillIndex = ReadonlyMap<string, SkillDefinition>;

export function indexSkills(
  definitions: readonly SkillDefinition[],
): SkillIndex {
  return new Map(definitions.map((node) => [node.id, node]));
}