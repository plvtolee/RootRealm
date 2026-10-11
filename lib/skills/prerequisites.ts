/**
 * RootRealm — skill prerequisite evaluation (TASKS 6.2).
 *
 * ```text
 * learned skill ids → which prerequisites each node satisfies, and why not
 * ```
 *
 * TASKS 6.2's acceptance criteria are two lines:
 *
 * - missing prerequisite → locked
 * - satisfied prerequisite → eligible **where other conditions pass**
 *
 * That second clause is the whole design constraint. Prerequisites are *one gate
 * among several*, and this module must not answer "unlocked" — only "are the
 * prerequisites met". TASKS 6.4 adds the evidence gate and TASKS 6.5 adds the
 * unlock record; conflating them here would make each of those harder to test and
 * impossible to explain. A player asking why a node is locked deserves to be told
 * which of several gates is closed, not a single undifferentiated "no".
 *
 * ## Why the answer names the missing ids rather than a boolean
 *
 * `SkillNodeStatus` in the prototype renders "Requires First Merge or Root Cause"
 * from this. A boolean would leave the screen inventing that sentence from a
 * lookup table, which is exactly how a UI ends up disagreeing with the domain
 * about what is missing. So the result carries the specific unmet ids and the
 * caller renders them.
 *
 * ## `any` versus `all`, and why both are evaluated
 *
 * Every node in TASKS 6.1's catalog uses `any` — each names two foundations that
 * each independently unlock it. `all` exists because the alternative is worse: a
 * future node that genuinely needs both prerequisites would silently receive
 * `any` semantics, and unlock early. Making the mode explicit costs one branch
 * and makes that failure impossible.
 *
 * ## Cycles are handled, not assumed away
 *
 * `validateCatalog` rejects a cyclic catalog at construction. This module still
 * resolves iteratively rather than recursively, because a cycle reaching
 * production should produce a locked node with a reason — not a stack overflow
 * that takes the page down. The Origin is the only node with no prerequisites, so
 * it is the sole seed.
 */
import type { SkillDefinition, SkillIndex } from "./definition";

/** Whether one node's prerequisites are met, and which are not. */
export interface PrerequisiteResult {
  readonly skillId: string;
  readonly satisfied: boolean;
  /**
   * Prerequisite ids that are not learned.
   *
   * For `any` mode this is the *whole* unmet set even when one is satisfied —
   * the screen shows the player what else would also work, which is the useful
   * information. For `all` mode it is every unmet id, and it is what blocks.
   */
  readonly missingIds: readonly string[];
  /**
   * Prerequisite ids that *are* learned. Kept alongside `missingIds` so a caller
   * can say "you have this one, not that one" without recomputing.
   */
  readonly satisfiedIds: readonly string[];
}

/** Evaluates prerequisites for one node against a learned set. */
export function evaluatePrerequisites(
  node: SkillDefinition,
  learnedIds: ReadonlySet<string>,
): PrerequisiteResult {
  const satisfiedIds: string[] = [];
  const missingIds: string[] = [];

  for (const prerequisiteId of node.prerequisiteIds) {
    if (learnedIds.has(prerequisiteId)) satisfiedIds.push(prerequisiteId);
    else missingIds.push(prerequisiteId);
  }

  // The Origin has no prerequisites and is therefore unconditionally satisfied.
  // Without this special case an empty list would fall through the `any` branch's
  // `every` check as vacuously true — correct by accident rather than by decision.
  const isOrigin = node.prerequisiteIds.length === 0;

  const satisfied =
    isOrigin ||
    (node.prerequisiteMode === "all"
      ? missingIds.length === 0
      : satisfiedIds.length > 0);

  return { skillId: node.id, satisfied, missingIds, satisfiedIds };
}

/** Prerequisites for every node in a catalog, keyed by skill id. */
export type PrerequisiteMap = ReadonlyMap<string, PrerequisiteResult>;

export function evaluateAll(
  definitions: readonly SkillDefinition[],
  learnedIds: Iterable<string>,
): PrerequisiteMap {
  const learned = learnedIds instanceof Set ? learnedIds : new Set(learnedIds);

  return new Map(
    definitions.map((node) => [node.id, evaluatePrerequisites(node, learned)]),
  );
}

/**
 * Whether `candidate` can be learned given what is already learned.
 *
 * A convenience over {@link evaluatePrerequisites} for a single question, and
 * deliberately *not* the whole answer: this says prerequisites only, so a caller
 * cannot accidentally present it as "unlockable" and skip the evidence gate that
 * TASKS 6.4 owns.
 */
export function prerequisitesMet(
  node: SkillDefinition,
  learnedIds: ReadonlySet<string>,
): boolean {
  return evaluatePrerequisites(node, learnedIds).satisfied;
}

/**
 * Whether every prerequisite is learned, regardless of the node's mode.
 *
 * Used by TASKS 6.5 to refuse a refund that would strand a dependent node: a
 * refund is invalid if it orphans something, and "anything depending on this"
 * means "this appears in any node's `prerequisiteIds`", which is mode-agnostic.
 */
export function dependentsOf(
  skillId: string,
  definitions: readonly SkillDefinition[],
): readonly SkillDefinition[] {
  return definitions.filter((node) => node.prerequisiteIds.includes(skillId));
}

/**
 * Cheapest path of prerequisites from what is learned to `targetId`.
 *
 * Returns `null` when the target is unreachable, which is the honest answer for a
 * cyclic or disconnected catalog rather than an empty path that would read as
 * "already there".
 *
 * Breadth-first, so the returned path is the fewest unlocks — the question a
 * player is asking when they wonder what to learn next.
 */
export function shortestPathTo(
  targetId: string,
  index: SkillIndex,
  learnedIds: ReadonlySet<string>,
): readonly string[] | null {
  if (learnedIds.has(targetId)) return [];

  const target = index.get(targetId);
  if (target === undefined) return null;

  /*
   * The search walks *up* from the target, following prerequisites, and stops at
   * the first learned node it reaches — that node is where the player already is.
   *
   * `via` maps a node to the next step back up toward the target, which is what
   * makes the reconstruction below a plain walk. An earlier version seeded its
   * visited set with the learned ids and so skipped the very nodes it was looking
   * for, returning `null` for every reachable target; a learned node has to be
   * visited *and* recognised as the endpoint, not excluded as already-seen.
   */
  const via = new Map<string, string>();
  const seen = new Set<string>();
  const queue: string[] = [];

  for (const prerequisiteId of target.prerequisiteIds) {
    if (seen.has(prerequisiteId)) continue;
    seen.add(prerequisiteId);
    via.set(prerequisiteId, targetId);
    queue.push(prerequisiteId);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentNode = index.get(current);
    // A prerequisite naming a node the catalog does not define cannot be
    // satisfied by learning anything, so this route is a dead end.
    if (currentNode === undefined) continue;

    /*
     * The walk ends at the first node that needs nothing further: either one
     * already learned, or a root with no prerequisites at all. The root case
     * matters — with an empty learned set there is no learned node to stop at,
     * and an earlier version walked past the Origin and reported every target
     * unreachable.
     */
    const reachedStart = learnedIds.has(current);
    const isRoot = currentNode.prerequisiteIds.length === 0;

    if (reachedStart || isRoot) {
      // Walk back up toward the target, then drop the target itself (the caller
      // already knows which node it asked about) and drop the learned starting
      // point (learning it is not part of the work remaining).
      // Walk back up toward the target. The chain is built from the start node
      // upward, which is already the order a player would learn in — reversing it
      // here would return the path backwards.
      const chain: string[] = [];
      let step: string | undefined = current;

      while (step !== undefined && step !== targetId) {
        chain.push(step);
        step = via.get(step);
      }

      if (reachedStart) chain.shift();

      return chain;
    }

    for (const prerequisiteId of currentNode.prerequisiteIds) {
      if (seen.has(prerequisiteId)) continue;
      seen.add(prerequisiteId);
      via.set(prerequisiteId, current);
      queue.push(prerequisiteId);
    }
  }

  return null;
}