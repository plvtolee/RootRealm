/**
 * RootRealm — cosmetic definitions (TASKS 13.1).
 *
 * ```text
 * the small starting catalog: frames, banners, titles, themes, effects
 * ```
 *
 * TASKS 13.1 lists five slots and says to keep the catalog small, which is the
 * interesting instruction. A cosmetic catalog is presentation with a price
 * attached, and both halves have to be real: a slot the preview cannot render is
 * a broken option, and a price the purchase flow cannot charge is a broken one.
 * Starting small means every entry is wired end to end before the catalog grows.
 *
 * ## Why a slot is a closed union and not a string
 *
 * A cosmetic belongs to exactly one slot, and the equip rule (TASKS 13.3) is
 * "one equipped item per slot". Returning a string would let a typo create a
 * seventh slot that no preview renders and no equip rule covers. The union makes
 * that a compile error.
 *
 * ## Why rarity is display metadata, like achievements
 *
 * Rarity influences how an item is *presented* and never what it *does* — no
 * cosmetic is stronger than another. Keeping it a display concern (and out of
 * either ledger) is what stops the shop from becoming a power ladder. It is the
 * same rule `SCORING.md §27` sets for achievements.
 *
 * ## Why the price is here and the ownership is not
 *
 * The price is a property of the item and is published with it; ownership is a
 * property of a developer (TASKS 13.2) and lives in the inventory. A definition
 * that carried an `owned` flag would be a definition per developer, which is the
 * mistake `quest_progress` and `skill_unlocks` both avoid: catalogue and state
 * are different tables.
 */
import type { QuestDefinition } from "../quests/definition";

/** The five slots (TASKS 13.1). */
export type CosmeticSlot = "frame" | "banner" | "title" | "theme" | "effect";

/** Every slot, in display order. */
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = ["frame", "banner", "title", "theme", "effect"];

/** Display name per slot. */
export const SLOT_LABEL: Readonly<Record<CosmeticSlot, string>> = {
  frame: "Frame",
  banner: "Banner",
  title: "Title",
  theme: "Theme",
  effect: "Effect",
};

/** Rarity, display-only (see the module header). */
export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";

/** One cosmetic as catalogued. */
export interface CosmeticDefinition {
  /** Stable id. Inventory rows reference it, so renaming orphans ownership. */
  readonly id: string;
  readonly slot: CosmeticSlot;
  readonly name: string;
  readonly description: string;
  readonly rarity: CosmeticRarity;
  /**
   * Price in CodeCoins, or null when the item is not purchasable.
   *
   * Null covers both quest rewards and anything granted by a season: they are
   * acquired, not bought, and a `0` price would make them purchasable for free.
   */
  readonly priceCodeCoins: number | null;
  /**
   * How the preview renders it, as a token-backed key.
   *
   * A key, not a colour: components map it to semantic tokens, so a cosmetic
   * cannot smuggle a raw hex value past the design system (AGENTS.md rule 1).
   */
  readonly appearance: string;
}

/** An indexed catalog, for O(1) lookup. */
export interface CosmeticIndex {
  readonly byId: ReadonlyMap<string, CosmeticDefinition>;
  readonly all: readonly CosmeticDefinition[];
  readonly bySlot: Readonly<Record<CosmeticSlot, readonly CosmeticDefinition[]>>;
}

/** Builds the lookup index. Throws on a duplicate id, which is a catalog bug. */
export function indexCosmetics(definitions: readonly CosmeticDefinition[]): CosmeticIndex {
  const byId = new Map<string, CosmeticDefinition>();
  const bySlot: Record<CosmeticSlot, CosmeticDefinition[]> = {
    frame: [],
    banner: [],
    title: [],
    theme: [],
    effect: [],
  };

  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      throw new Error(`Duplicate cosmetic id "${definition.id}".`);
    }
    byId.set(definition.id, definition);
    bySlot[definition.slot].push(definition);
  }

  return { byId, all: definitions, bySlot };
}

/** Validates a catalog. Returns the problems found, for a test or a startup check. */
export function validateCosmeticCatalog(definitions: readonly CosmeticDefinition[]): readonly string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const definition of definitions) {
    if (seen.has(definition.id)) problems.push(`Duplicate cosmetic id "${definition.id}".`);
    seen.add(definition.id);

    if (definition.priceCodeCoins !== null && definition.priceCodeCoins < 0) {
      problems.push(`Cosmetic "${definition.id}" has a negative price.`);
    }
    if (definition.name.trim().length === 0) {
      problems.push(`Cosmetic "${definition.id}" has no name.`);
    }
    if (definition.appearance.trim().length === 0) {
      problems.push(`Cosmetic "${definition.id}" has no appearance key.`);
    }
  }

  return problems;
}

/**
 * Every cosmetic a quest can grant, so a quest's reward id is never a dead
 * reference.
 *
 * This is the check TASKS 12.3's `cosmeticRewardId` needs: the quest catalog and
 * the cosmetic catalog are separate files, and nothing but this function stops a
 * quest from promising an item that does not exist.
 */
export function missingQuestRewardIds(
  quests: readonly QuestDefinition[],
  cosmetics: CosmeticIndex,
): readonly string[] {
  const missing: string[] = [];

  for (const quest of quests) {
    if (quest.cosmeticRewardId !== null && !cosmetics.byId.has(quest.cosmeticRewardId)) {
      missing.push(`${quest.id} → ${quest.cosmeticRewardId}`);
    }
  }

  return missing;
}