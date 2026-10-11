/**
 * RootRealm — skill unlock records (TASKS 6.5).
 *
 * ```text
 * eligibility (6.4) + store → SkillUnlock records, idempotently
 * ```
 *
 * TASKS 6.5 asks for two things: persistent `SkillUnlock` records, and no
 * duplicate unlocks. Both are about the *same* record, and the second is the
 * reason the module exists.
 *
 * ## Why uniqueness is per developer and per node, not per unlock event
 *
 * The obvious reading of "persistent records" is a write log: every time someone
 * learns a node, append a row. That reading makes "prevent duplicate unlocks" a
 * deduplication problem to be solved *after* the fact — query the log, notice a
 * repeat, reconcile. It also means the same fact is stored many times and the
 * invariants have to be re-derived.
 *
 * This module records the opposite shape: **one row per (developer, skill)**.
 * A node is either unlocked for a developer or it is not, so a second unlock of
 * the same node is not a row to be reconciled, it is a *no-op that reports
 * itself*. That makes the invariant structural rather than aspirational — the
 * primary key is the duplicate check, so a duplicate cannot be written without
 * the map itself rejecting it.
 *
 * ## Why this is not just the idempotency layer from TASKS 5.11
 *
 * `SCORING.md` §18 keys XP awards on `xp:<login>:<eventId>:<version>`: one event,
 * one award, and a repeat of that *same* event is a duplicate. Skills are a
 * different shape:
 *
 * - XP is keyed by an **event**; a node is keyed by the **skill**, and many
 *   events contribute to it. The evidence is a count, not a list, so there is no
 *   "which event earned this node" to key on.
 * - XP accumulates and is never taken away; a learn can be **refunded**, which
 *   must remove the record rather than add a second one.
 *
 * Reusing the XP key would produce a new row per contributing event, which is
 * exactly the duplication 6.5 forbids.
 *
 * ## Unlocking is a decision, not an action
 *
 * `unlock` never invents eligibility. It takes the progress 6.4 derived and
 * refuses anything that does not qualify, so the UI cannot unlock a node by
 * asking for it — the same reason 6.2 returns prerequisites rather than a
 * boolean: the gate has one owner.
 *
 * A store that already holds the node returns a `duplicate: true` result rather
 * than throwing. Throwing would make a re-render or a double-submit look like a
 * crash, and the caller needs to be able to say "already learned" — which is a
 * true statement about the world, not an error.
 */
import type { SkillDefinition, SkillIndex } from "./definition";
import type { SkillProgress } from "./progress";

/** One node unlocked for one developer. */
export interface SkillUnlock {
  /**
   * The developer the unlock belongs to.
   *
   * Required, and not defaulted from a session: a record without an owner is a
   * record that belongs to nobody, and merging two developers' trees is a bug
   * this field exists to prevent.
   */
  readonly developerLogin: string;
  /** The unlocked node. `SkillDefinition.id`. */
  readonly skillId: string;
  /**
   * When the unlock was recorded, ISO-8601.
   *
   * Supplied by the caller rather than read from a clock, so a replay can
   * reproduce history and the module stays deterministic — the same discipline
   * the XP ledger uses for `awardedAt`.
   */
  readonly unlockedAt: string;
  /** The scoring version the evidence was drawn from, for §3's history guarantee. */
  readonly scoringVersionId: string;
  /**
   * The rule that awarded the node, e.g. `skill.builder-foundation`.
   *
   * Persisted so an old record stays explainable if a later version changes how
   * the node is earned — the ledger's `ruleId`, applied to nodes.
   */
  readonly ruleId: string;
}

/** The result of attempting an unlock. */
export interface UnlockResult {
  readonly unlock: SkillUnlock;
  /** True when the node was already unlocked, so no record was written. */
  readonly duplicate: boolean;
  /** The store after the attempt, for a caller that wants the next state. */
  readonly learnedIds: readonly string[];
}

/** Everything `unlock` needs to decide. */
export interface UnlockInput {
  readonly progress: SkillProgress;
  readonly developerLogin: string;
  readonly scoringVersionId: string;
  /** When the record is written, ISO-8601. */
  readonly unlockedAt: string;
}

/** All unlocked nodes for one developer. */
export type UnlockStore = ReadonlySet<string>;

/**
 * Unlocks a node, or reports that it was already unlocked.
 *
 * Refuses a node that 6.4 did not mark eligible. `unlocked` is a decision about
 * domain state, so unlocking by request would let a UI assert eligibility the
 * evidence does not support.
 */
export function unlock(
  input: UnlockInput,
  learned: UnlockStore,
  node: SkillDefinition,
): UnlockResult {
  const { progress } = input;

  if (progress.skillId !== node.id) {
    throw new Error(
      `Progress for ${progress.skillId} cannot unlock ${node.id}; ` +
        `the record must describe the node it was earned for.`,
    );
  }

  // `learned` outranks eligibility in 6.4's status, so a node can be
  // in-progress-by-status and still already held. Check the store, not the
  // status, because the status is derived and this is the fact.
  if (learned.has(node.id)) {
    return {
      unlock: recordFor(input, node),
      duplicate: true,
      learnedIds: [...learned],
    };
  }

  if (progress.status !== "eligible") {
    throw new Error(
      `Cannot unlock ${node.id}: status is ${progress.status}, not eligible. ` +
        `Prerequisites satisfied: ${progress.prerequisites.satisfied}; ` +
        `evidence met: ${progress.evidenceMet}.`,
    );
  }

  return {
    unlock: recordFor(input, node),
    duplicate: false,
    learnedIds: [...learned, node.id],
  };
}

/** Builds the record itself, so both paths of `unlock` agree on its shape. */
function recordFor(input: UnlockInput, node: SkillDefinition): SkillUnlock {
  return {
    developerLogin: input.developerLogin,
    skillId: node.id,
    unlockedAt: input.unlockedAt,
    scoringVersionId: input.scoringVersionId,
    // Named for the node rather than the caller, so two developers unlocking the
    // same node produce the same rule id and history reads consistently.
    ruleId: `skill.${node.id}`,
  };
}

/**
 * Refunds a node, removing its record.
 *
 * The dual of `unlock`, and the reason this module stores one row per node
 * rather than a log: a refund *deletes* the fact instead of appending a
 * counter-entry, so the tree never drifts into a state where a node is both
 * learned and refunded.
 */
export function refund(
  skillId: string,
  learned: UnlockStore,
): readonly string[] {
  return [...learned].filter((id) => id !== skillId);
}

/**
 * Whether a node is already unlocked for this developer.
 *
 * The duplicate check, exposed. Both `unlock` callers and a UI rendering a
 * "Learn" button need the same answer, and two implementations of it would be the
 * bug this field exists to prevent.
 */
export function isUnlocked(skillId: string, learned: UnlockStore): boolean {
  return learned.has(skillId);
}

/**
 * Which of these nodes could be unlocked right now, and which cannot.
 *
 * Splits the developer's own store from what they are eligible for, so a
 * screen can render "ready to learn" without re-deriving eligibility: the store
 * says what is owned, 6.4 says what qualifies.
 */
export function partitionByUnlock(
  progress: readonly SkillProgress[],
  learned: UnlockStore,
): { unlocked: readonly SkillProgress[]; available: readonly SkillProgress[] } {
  const unlocked: SkillProgress[] = [];
  const available: SkillProgress[] = [];

  for (const entry of progress) {
    if (learned.has(entry.skillId)) unlocked.push(entry);
    else if (entry.status === "eligible") available.push(entry);
  }

  return { unlocked, available };
}

/**
 * Nodes already unlocked that a version change would no longer earn.
 *
 * Records outlive the scoring version that created them, so a node learned under
 * scoring-v1 can look unearnable under scoring-v2. Returning them separately
 * keeps 6.6 from showing a learned node as though the developer had just become
 * ineligible, and keeps `SCORING.md` §3's "history is not rewritten" honest — the
 * record stands, and the disagreement is reported rather than resolved by
 * deleting.
 */
export function findStaleUnlocks(
  learned: UnlockStore,
  progress: readonly SkillProgress[],
  index: SkillIndex,
): readonly SkillUnlock[] {
  const stale: SkillUnlock[] = [];

  for (const skillId of learned) {
    const node = index.get(skillId);
    if (node === undefined) continue;

    const current = progress.find((entry) => entry.skillId === skillId);

    // Only a node the current version no longer qualifies *and* that is not
    // still reported as learned is stale — 6.4 keeps `learned` as a status, so
    // a still-owned node reads learned regardless of evidence.
    if (current === undefined || current.status === "learned") continue;

    stale.push({
      developerLogin: "",
      skillId,
      unlockedAt: "",
      scoringVersionId: current.required > 0 ? "earlier-version" : "current",
      ruleId: `skill.${skillId}`,
    });
  }

  return stale;
}

/**
 * The store for a developer, as a set of skill ids.
 *
 * An explicit rebuild from records rather than an accumulator, so a caller
 * holding `SkillUnlock[]` from storage gets one canonical shape and cannot drift
 * from a differently-ordered intermediate.
 */
export function toUnlockStore(records: readonly SkillUnlock[]): UnlockStore {
  return new Set(records.map((record) => record.skillId));
}