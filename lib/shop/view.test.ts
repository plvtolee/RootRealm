import { describe, expect, it } from "vitest";

import { COSMETIC_INDEX, DEFAULT_OWNED_IDS } from "../cosmetics/catalog";
import { equipOwnedDefaults, NOTHING_EQUIPPED, type EquippedCosmetics } from "../cosmetics/equip";
import { grantCosmetic, initialInventory, type Inventory } from "../cosmetics/inventory";
import { currencyKey, type CurrencyTransaction } from "../currency/ledger";

import { computeShopView, priceLabel, SHOP_SLOTS } from "./view";

const AT = "2026-10-12T09:00:00.000Z";
const USER = "user-1";

function funding(amount: number): CurrencyTransaction {
  return {
    id: currencyKey(USER, "adjustment", "test"),
    userId: USER,
    amount,
    reason: "adjustment",
    sourceId: "test",
    recordedAt: AT,
  };
}

function shop(
  transactions: readonly CurrencyTransaction[] = [],
  inventory: Inventory = initialInventory(USER, AT),
  equipped: EquippedCosmetics = equipOwnedDefaults(inventory, DEFAULT_OWNED_IDS),
) {
  return computeShopView({ userId: USER, inventory, equipped, transactions });
}

describe("shop view (15.1)", () => {
  it("lists every catalog item", () => {
    expect(shop().items).toHaveLength(COSMETIC_INDEX.all.length);
  });

  it("carries the price from the definition rather than a mock", () => {
    const signal = shop([funding(1_000)]).items.find(
      (item) => item.definition.id === "frame-signal",
    )!;

    expect(signal.price).toBe(250);
    expect(priceLabel(signal)).toBe("250");
  });

  it("marks the starter items owned and the rest not", () => {
    const view = shop();

    expect(view.ownedCount).toBe(DEFAULT_OWNED_IDS.length);
    expect(view.lockedCount).toBe(COSMETIC_INDEX.all.length - DEFAULT_OWNED_IDS.length);
  });

  it("marks the worn item per slot", () => {
    const view = shop();

    expect(
      view.items.filter((item) => item.equipped).map((item) => item.slot),
    ).toEqual([...SHOP_SLOTS]);
  });

  it("does not mark a quest reward purchasable", () => {
    const forge = shop([funding(10_000)]).items.find(
      (item) => item.definition.id === "frame-forge",
    )!;

    expect(forge.price).toBeNull();
    expect(forge.purchasable).toBe(false);
    expect(priceLabel(forge)).toBe("Quest reward");
  });
});

describe("affordability is shown, never decided (15.3)", () => {
  it("marks a priced item affordable when the balance covers it", () => {
    const signal = shop([funding(250)]).items.find((item) => item.definition.id === "frame-signal")!;

    expect(signal.affordable).toBe(true);
  });

  it("marks it unaffordable one coin short", () => {
    const signal = shop([funding(249)]).items.find((item) => item.definition.id === "frame-signal")!;

    expect(signal.affordable).toBe(false);
  });

  it("never marks an owned item affordable — there is nothing left to buy", () => {
    const minimal = shop([funding(10_000)]).items.find(
      (item) => item.definition.id === "frame-minimal",
    )!;

    expect(minimal.owned).toBe(true);
    expect(minimal.affordable).toBe(false);
    expect(minimal.purchasable).toBe(false);
  });

  it("reports the balance it judged against", () => {
    expect(shop([funding(321)]).balance).toBe(321);
  });

  it("keeps one developer's balance out of another's shop", () => {
    const view = computeShopView({
      userId: "user-2",
      inventory: initialInventory("user-2", AT),
      equipped: NOTHING_EQUIPPED,
      transactions: [funding(1_000)],
    });

    expect(view.balance).toBe(0);
  });

  it("reflects a freshly purchased item as owned and affordable no longer", () => {
    const inventory = grantCosmetic(initialInventory(USER, AT), {
      itemId: "frame-signal",
      sourceKind: "purchase",
      sourceId: "frame-signal",
      acquiredAt: AT,
    }).inventory;

    const signal = shop([funding(250)], inventory).items.find(
      (item) => item.definition.id === "frame-signal",
    )!;

    expect(signal).toMatchObject({ owned: true, affordable: false, purchasable: false });
  });

  it("is deterministic for the same input", () => {
    expect(shop([funding(100)])).toEqual(shop([funding(100)]));
  });
});