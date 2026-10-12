/**
 * RootRealm — the shop screen's view model (TASKS 15.1 and 15.2).
 *
 * ```text
 * catalog + wallet → what the shop shows, and what each row can do
 * ```
 *
 * TASKS 15.1 replaces the mock catalog with the real one. That is mostly the
 * cosmetic catalog (TASKS 13.1) plus three facts the shop is the only screen that
 * has: what it costs, whether the developer owns it, and whether they can afford
 * it *now*.
 *
 * ## Why affordability is a displayed fact and never a decision
 *
 * `affordable` exists so the button can be disabled and the price can be shown as
 * reachable or not. The decision to sell is made on the server by
 * `purchaseCosmetic` (TASKS 14.4) against the balance at the moment of the
 * request. A client that computed affordability itself would be right about a
 * balance that has since changed, which is exactly the race the atomic flow
 * exists to close.
 *
 * ## Why every item is listed, whatever its state
 *
 * The shop's job is to show what exists. An unowned, unaffordable item is still
 * the reason a developer keeps earning, so it stays in the grid with its price —
 * only quest rewards are marked separately, because they are acquired rather than
 * bought and a price for them would be a lie.
 *
 * Presentation (swatch styling, card layout) is not here. It lives with the
 * screen.
 */
import { COSMETIC_INDEX } from "../cosmetics/catalog";
import { COSMETIC_SLOTS, SLOT_LABEL, type CosmeticDefinition, type CosmeticIndex, type CosmeticSlot } from "../cosmetics/definition";
import { equippedIn, type EquippedCosmetics } from "../cosmetics/equip";
import { ownsCosmetic, type Inventory } from "../cosmetics/inventory";

import { balanceOf, canAfford, type CurrencyTransaction } from "../currency/ledger";

/** One catalog item as the shop renders it. */
export interface ShopItemView {
  readonly definition: CosmeticDefinition;
  readonly slot: CosmeticSlot;
  readonly slotLabel: string;
  /** Held by the developer. */
  readonly owned: boolean;
  /** Currently worn in its slot. */
  readonly equipped: boolean;
  /** Priced in CodeCoins. Null for a quest reward. */
  readonly price: number | null;
  /** Priced, not owned, and the balance covers it right now. */
  readonly affordable: boolean;
  /** What the Buy action would do. A quest reward cannot be bought. */
  readonly purchasable: boolean;
}

/** The whole shop screen's state for one developer. */
export interface ShopViewState {
  readonly items: readonly ShopItemView[];
  /** The balance at this moment. */
  readonly balance: number;
  readonly ownedCount: number;
  readonly totalCount: number;
  /** Items the developer does not own yet, in catalog order. */
  readonly lockedCount: number;
}

/**
 * Derives the shop screen's state.
 *
 * `userId` is needed for the balance and the affordability check; the inventory
 * and equipped map supply the rest. All three are read, never assumed.
 */
export function computeShopView(input: {
  readonly userId: string;
  readonly inventory: Inventory;
  readonly equipped: EquippedCosmetics;
  readonly transactions: readonly CurrencyTransaction[];
  readonly index?: CosmeticIndex;
}): ShopViewState {
  const index = input.index ?? COSMETIC_INDEX;
  const balance = balanceOf(input.transactions, input.userId);

  const items: ShopItemView[] = index.all.map((definition) => {
    const owned = ownsCosmetic(input.inventory, definition.id);
    const price = definition.priceCodeCoins;
    const affordable =
      owned === false &&
      price !== null &&
      canAfford(input.transactions, input.userId, price);

    return {
      definition,
      slot: definition.slot,
      slotLabel: SLOT_LABEL[definition.slot],
      owned,
      equipped: equippedIn(input.equipped, definition.slot) === definition.id,
      price,
      affordable,
      purchasable: owned === false && price !== null,
    };
  });

  return {
    items,
    balance,
    ownedCount: items.filter((item) => item.owned).length,
    totalCount: items.length,
    lockedCount: items.filter((item) => item.owned === false).length,
  };
}

/** A price as the shop writes it, e.g. "250" or "Quest reward". */
export function priceLabel(item: ShopItemView): string {
  if (item.price === null) return "Quest reward";
  if (item.price === 0) return "Free";
  return item.price.toLocaleString("en-US");
}

/** The five slots, in display order — the shop's filter strip. */
export const SHOP_SLOTS: readonly CosmeticSlot[] = COSMETIC_SLOTS;