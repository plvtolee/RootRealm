/**
 * RootRealm — equipped cosmetics (TASKS 13.3).
 *
 * ```text
 * inventory + equipped map → the same equipped map, or a refusal
 * ```
 *
 * TASKS 13.3 is "implement equip/unequip", and the only rule it states is one per
 * slot. Representing the equipped set as a *map keyed by slot* — rather than a
 * list of item ids with an `equipped` flag — makes that rule structural instead
 * of enforced: two items in one slot cannot both be keys, so the impossible
 * state has no representation to reach. The `inventory_items.equipped` column
 * (TASKS 10.4) stores the same fact; a map here is what the constraint means
 * before it becomes a row.
 *
 * ## Equip never grants
 *
 * `equipCosmetic` refuses an item the developer does not own. Equipping is a
 * presentation choice about something already in the inventory; if it could
 * grant, the shop and the equip button would be the same operation, and the
 * purchase flow's atomicity (TASKS 14.4) would be a thing a UI click could
 * bypass. Ownership is decided in one place.
 *
 * ## Equipping replaces, unequipping clears
 *
 * Equipping in a slot that is already filled replaces the occupant rather than
 * failing: a developer clicking a different frame expects a different frame. The
 * previous item stays owned — it is just not worn.
 */
import { COSMETIC_INDEX } from "./catalog";
import type { CosmeticIndex, CosmeticSlot } from "./definition";
import { ownsCosmetic, type Inventory } from "./inventory";

/**
 * The equipped item per slot. A missing key means the slot is empty.
 *
 * Partial by design: unequipping a slot must be expressible, and `null` for a
 * key that is not there would be two ways to say the same thing.
 */
export type EquippedCosmetics = Readonly<Partial<Record<CosmeticSlot, string>>>;

/** Nothing equipped at all — the state a developer starts in. */
export const NOTHING_EQUIPPED: EquippedCosmetics = {};

/** Why an equip was refused. */
export type EquipRefusal =
  /** The item is not in the catalog. */
  | "unknown_item"
  /** The developer does not own it. */
  | "not_owned";

/** The outcome of attempting an equip. */
export type EquipOutcome =
  | { readonly ok: true; readonly equipped: EquippedCosmetics }
  | { readonly ok: false; readonly refusal: EquipRefusal };

/**
 * The equipped item in a slot, or null when the slot is empty.
 *
 * The one place a "no equipped item" answer is produced, so every caller gives
 * the same answer for the same state.
 */
export function equippedIn(equipped: EquippedCosmetics, slot: CosmeticSlot): string | null {
  return equipped[slot] ?? null;
}

/**
 * Equips an item, or reports why not.
 *
 * Refuses an item the developer does not own, and an item the catalog does not
 * publish. Both are states the caller can act on — an unowned item is a shop
 * visit, an unknown one is a bug worth surfacing rather than silently ignoring.
 */
export function equipCosmetic(
  inventory: Inventory,
  equipped: EquippedCosmetics,
  itemId: string,
  index: CosmeticIndex = COSMETIC_INDEX,
): EquipOutcome {
  const definition = index.byId.get(itemId);
  if (definition === undefined) {
    return { ok: false, refusal: "unknown_item" };
  }

  if (!ownsCosmetic(inventory, itemId)) {
    return { ok: false, refusal: "not_owned" };
  }

  if (equipped[definition.slot] === itemId) {
    return { ok: true, equipped };
  }

  return { ok: true, equipped: { ...equipped, [definition.slot]: itemId } };
}

/**
 * Clears a slot.
 *
 * The item stays owned. Unequipping is not a refund, and it is not a reason to
 * reach into the inventory — the only way to lose an item is Phase 10's cascade.
 */
export function unequipCosmetic(
  equipped: EquippedCosmetics,
  slot: CosmeticSlot,
): EquippedCosmetics {
  if (!(slot in equipped)) return equipped;

  const next: Record<string, string> = { ...equipped };
  delete next[slot];
  return next as EquippedCosmetics;
}

/**
 * Equips one item per slot, from the items already owned.
 *
 * Used for the starter state: `DEFAULT_OWNED_IDS` is one item per slot, so the
 * defaults are what a new developer wears. Slots the inventory does not fill are
 * left empty rather than filled with a substitute — an empty frame is honest, a
 * substituted one would be a claim about what the developer chose.
 */
export function equipOwnedDefaults(
  inventory: Inventory,
  itemIds: readonly string[],
  index: CosmeticIndex = COSMETIC_INDEX,
): EquippedCosmetics {
  let equipped: EquippedCosmetics = NOTHING_EQUIPPED;

  for (const itemId of itemIds) {
    const definition = index.byId.get(itemId);
    if (definition === undefined || !ownsCosmetic(inventory, itemId)) continue;

    const outcome = equipCosmetic(inventory, equipped, itemId, index);
    if (outcome.ok) equipped = outcome.equipped;
  }

  return equipped;
}