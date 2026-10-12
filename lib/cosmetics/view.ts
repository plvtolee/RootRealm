/**
 * RootRealm — the customization screen's view model (TASKS 13.4).
 *
 * ```text
 * inventory + equipped + catalog → CustomizationViewState (for the UI)
 * ```
 *
 * The same constraint the skill tree (6.6), achievements (7.4) and quests (12.2)
 * follow: the screen consumes domain state and derives nothing itself. Ownership
 * and equip rules are decided in `inventory.ts` and `equip.ts`; this module joins
 * them so "is this item wearable" has exactly one answer.
 *
 * ## Why an unresolvable equipped id renders as empty
 *
 * `equipCosmetic` refuses items outside the catalog, so an equipped id the index
 * cannot resolve can only come from a hand-built input. The view drops it and
 * reports the slot as empty rather than rendering a nameless frame: a missing
 * name and description would be worse than an honest gap, and the slot is the
 * part a developer would notice.
 *
 * ## Why the view marks locked items rather than hiding them
 *
 * The shop is where an unowned item is bought, and a catalog a developer cannot
 * see is a catalog they cannot want. Unowned items appear in the same slot lists,
 * marked `owned: false`, with the price carried through from the definition — the
 * screen can then render "locked" honestly instead of inventing a
 * "coming soon" placeholder, and TASKS 15.3's purchase flow can turn exactly
 * these rows into buttons.
 *
 * Presentation (swatch styling, ordering within a section) is not here. It lives
 * with the screen.
 */
import { COSMETIC_INDEX } from "./catalog";
import { COSMETIC_SLOTS, SLOT_LABEL, type CosmeticDefinition, type CosmeticIndex, type CosmeticSlot } from "./definition";
import { equippedIn, type EquippedCosmetics } from "./equip";
import { ownsCosmetic, type Inventory } from "./inventory";

/** One cosmetic as the screen renders it. */
export interface CosmeticOptionView {
  readonly definition: CosmeticDefinition;
  /** Held by the developer. */
  readonly owned: boolean;
  /** Worn in its slot right now. */
  readonly equipped: boolean;
  /**
   * Whether the screen may equip it: owned, catalogued, and not already worn.
   *
   * The one place the three conditions are combined. The screen uses this to
   * decide the control's state, so it cannot accidentally offer "equip" on an
   * item the equip rule would refuse.
   */
  readonly equippable: boolean;
}

/** One slot's section. */
export interface CosmeticSlotView {
  readonly slot: CosmeticSlot;
  readonly label: string;
  readonly options: readonly CosmeticOptionView[];
  /** The worn item, or null when the slot is empty. */
  readonly equipped: CosmeticDefinition | null;
}

/** The whole customization screen's state for one developer. */
export interface CustomizationViewState {
  readonly slots: readonly CosmeticSlotView[];
  readonly ownedCount: number;
  readonly totalCount: number;
  /** Slots with nothing in them, by name, so the screen can say so plainly. */
  readonly emptySlots: readonly CosmeticSlot[];
}

/**
 * Derives the customization screen's state.
 *
 * Every slot is present whether or not the catalog fills it, and slots keep the
 * catalog's declared order (`COSMETIC_SLOTS`) rather than whatever order the
 * catalog file happens to be written in — the tab strip is a design surface, not
 * an accident of the source.
 */
export function computeCustomizationView(
  inventory: Inventory,
  equipped: EquippedCosmetics,
  index: CosmeticIndex = COSMETIC_INDEX,
): CustomizationViewState {
  let ownedCount = 0;

  const slots: CosmeticSlotView[] = COSMETIC_SLOTS.map((slot) => {
    const options: CosmeticOptionView[] = index.bySlot[slot].map((definition) => {
      const owned = ownsCosmetic(inventory, definition.id);
      if (owned) ownedCount += 1;

      const isEquipped = equippedIn(equipped, slot) === definition.id;
      return { definition, owned, equipped: isEquipped, equippable: owned && !isEquipped };
    });

    const equippedId = equippedIn(equipped, slot);
    return {
      slot,
      label: SLOT_LABEL[slot],
      options,
      equipped: equippedId === null ? null : (index.byId.get(equippedId) ?? null),
    };
  });

  return {
    slots,
    ownedCount,
    totalCount: index.all.length,
    emptySlots: slots.filter((section) => section.equipped === null).map((section) => section.slot),
  };
}