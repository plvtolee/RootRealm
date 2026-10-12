/**
 * RootRealm — quest definitions (TASKS 12.1).
 *
 * ```text
 * evidence vocabulary + a period → typed QuestDefinition[]
 * ```
 *
 * TASKS 12.1 asks for daily, weekly and goal quests. The three differ in exactly
 * one respect — **the window their evidence is counted over** — and everything
 * else about a quest is the same shape. So this module has one `QuestDefinition`
 * with a `window` field rather than three types, which is what lets TASKS 12.2
 * have one counting function instead of three that can disagree.
 *
 * ## Why the criterion reuses the skill evidence union
 *
 * A quest is "merge 3 pull requests"; a skill node is "merge 3 pull requests".
 * Both must be counted from the same events by the same rule, or a developer
 * could satisfy the quest and not the node (or the reverse) from one merge. The
 * `EvidenceRequirement` union from `lib/skills/definition.ts` is that vocabulary,
 * so a quest cannot invent a measurement skills do not know, and 12.2 delegates
 * counting to the same `evaluateRequirement` the skill tree uses.
 *
 * ## Why rewards are declared, not computed
 *
 * `xpReward` and `codeCoinReward` are the *terms* of the quest, published when it
 * is offered. TASKS 12.3 awards them; nothing here awards anything. Keeping the
 * terms on the definition means the reward a developer saw is the reward they can
 * hold the system to.
 *
 * ## Why `cosmeticRewardId` is a string reference, not a cosmetic object
 *
 * Cosmetics are TASKS 13.1. A quest that embedded a cosmetic would have to change
 * whenever the catalog did. It holds an id, and the catalog is the authority on
 * what that id means — the same indirection the skill tree uses for presentation.
 */
import type { EvidenceRequirement } from "../skills/definition";

/** The three quest periods (TASKS 12.1, PRD §17). */
export type QuestKind = "daily" | "weekly" | "goal";

/**
 * The window a quest's evidence is counted over.
 *
 * `daily` and `weekly` are calendar windows derived from a timestamp;
 * `lifetime` counts the developer's whole observed history, which is what makes
 * a goal a goal — it is not reset, and it is not "this season".
 */
export type QuestWindow = "daily" | "weekly" | "lifetime";

/** A quest as offered. */
export interface QuestDefinition {
  /** Stable id. Progress records reference it, so renaming orphans history. */
  readonly id: string;
  readonly kind: QuestKind;
  /** The window the criterion is counted over. */
  readonly window: QuestWindow;
  readonly title: string;
  readonly description: string;
  /** What counts, and how much, counted within `window`. */
  readonly criterion: EvidenceRequirement;
  /** XP granted on completion (TASKS 12.3). */
  readonly xpReward: number;
  /** CodeCoins granted on completion (TASKS 12.3). */
  readonly codeCoinReward: number;
  /**
   * A cosmetic granted on completion, by catalog id, or null.
   *
   * An id rather than an object so the catalog stays the one authority on what a
   * cosmetic is (TASKS 13.1).
   */
  readonly cosmeticRewardId: string | null;
}

/** An indexed catalog, for O(1) lookup by id. */
export interface QuestIndex {
  readonly byId: ReadonlyMap<string, QuestDefinition>;
  readonly all: readonly QuestDefinition[];
}

/** Builds the lookup index. Throws on a duplicate id, which is a catalog bug. */
export function indexQuests(definitions: readonly QuestDefinition[]): QuestIndex {
  const byId = new Map<string, QuestDefinition>();

  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      throw new Error(`Duplicate quest id "${definition.id}".`);
    }
    byId.set(definition.id, definition);
  }

  return { byId, all: definitions };
}

/** Validates a catalog, for a test or a startup check. Returns the problems found. */
export function validateQuestCatalog(definitions: readonly QuestDefinition[]): readonly string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const definition of definitions) {
    if (seen.has(definition.id)) problems.push(`Duplicate quest id "${definition.id}".`);
    seen.add(definition.id);

    if (definition.criterion.count <= 0) {
      problems.push(`Quest "${definition.id}" requires a positive count.`);
    }
    if (definition.xpReward < 0 || definition.codeCoinReward < 0) {
      problems.push(`Quest "${definition.id}" has a negative reward.`);
    }
    if (definition.window === "lifetime" && definition.kind !== "goal") {
      problems.push(`Quest "${definition.id}" is ${definition.kind} but counts over a lifetime.`);
    }
    if (definition.window !== "lifetime" && definition.kind === "goal") {
      problems.push(`Quest "${definition.id}" is a goal but resets ${definition.window}.`);
    }
  }

  return problems;
}