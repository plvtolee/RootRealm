import { describe, expect, it } from "vitest";

import { QUEST_DEFINITIONS } from "../quests/catalog";
import { COSMETIC_DEFINITIONS, COSMETIC_INDEX, DEFAULT_OWNED_IDS } from "./catalog";
import {
  COSMETIC_SLOTS,
  indexCosmetics,
  missingQuestRewardIds,
  validateCosmeticCatalog,
  type CosmeticDefinition,
} from "./definition";
import {
  equipCosmetic,
  equipOwnedDefaults,
  equippedIn,
  NOTHING_EQUIPPED,
  unequipCosmetic,
  type EquippedCosmetics,
} from "./equip";
import {
  grantCosmetic,
  grantFromQuestCompletion,
  initialInventory,
  inventoryKey,
  ownedItemIds,
  ownsCosmetic,
  type Inventory,
} from "./inventory";
import { computeCustomizationView } from "./view";

const AT = "2026-10-12T09:00:00.000Z";
const USER = "user-1";

function definition(over: Partial<CosmeticDefinition> = {}): CosmeticDefinition {
  return {
    id: "frame-test",
    slot: "frame",
    name: "Test",
    description: "A test item.",
    rarity: "common",
    priceCodeCoins: 0,
    appearance: "neutral",
    ...over,
  };
}

function inventoryWith(...itemIds: string[]): Inventory {
  return {
    userId: USER,
    items: itemIds.map((itemId) => ({
      itemId,
      sourceKind: "default" as const,
      sourceId: null,
      acquiredAt: AT,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* 13.1 — definitions                                                          */
/* -------------------------------------------------------------------------- */

describe("cosmetic catalog (13.1)", () => {
  it("covers every slot, and keeps the catalog small", () => {
    const filled = COSMETIC_SLOTS.filter((slot) => COSMETIC_INDEX.bySlot[slot].length > 0);

    expect(filled).toEqual([...COSMETIC_SLOTS]);
    // "Keep the initial catalog small" is an instruction, so it is asserted:
    // growth has to be a deliberate change to the spec, not a side effect.
    expect(COSMETIC_DEFINITIONS.length).toBeLessThanOrEqual(20);
  });

  it("validates without problems", () => {
    expect(validateCosmeticCatalog(COSMETIC_DEFINITIONS)).toEqual([]);
  });

  it("has no duplicate ids", () => {
    expect(indexCosmetics(COSMETIC_DEFINITIONS).all.length).toBe(COSMETIC_DEFINITIONS.length);
  });

  it("refuses a duplicate id rather than resolving it arbitrarily", () => {
    expect(() => indexCosmetics([definition(), definition()])).toThrow(/Duplicate cosmetic id/);
  });

  it("names a negative price as a catalog problem", () => {
    expect(validateCosmeticCatalog([definition({ priceCodeCoins: -1 })])).toContain(
      'Cosmetic "frame-test" has a negative price.',
    );
  });

  it("names a nameless or unrenderable item as a catalog problem", () => {
    const problems = validateCosmeticCatalog([
      definition({ name: "  ", appearance: "" }),
    ]);

    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("no name");
    expect(problems[1]).toContain("no appearance key");
  });

  it("publishes every quest's cosmetic reward", () => {
    // The cross-catalog check from TASKS 12.3's definition: a quest that promises
    // an item nobody can render is a dead promise, and this is the only check.
    expect(missingQuestRewardIds(QUEST_DEFINITIONS, COSMETIC_INDEX)).toEqual([]);
  });

  it("names a quest reward that points at nothing", () => {
    const broken = [
      { ...QUEST_DEFINITIONS[0], id: "weekly-broken", cosmeticRewardId: "frame-missing" },
    ];

    expect(missingQuestRewardIds(broken, COSMETIC_INDEX)).toEqual(["weekly-broken → frame-missing"]);
  });

  it("prices a non-purchasable item as null rather than free", () => {
    // A quest reward priced at 0 would be purchasable for nothing, which makes it
    // both a reward and a purchase.
    const reward = COSMETIC_INDEX.byId.get("frame-forge")!;

    expect(reward.priceCodeCoins).toBeNull();
  });

  it("grants the zero-price basics, one per slot", () => {
    const granted = DEFAULT_OWNED_IDS.map((id) => COSMETIC_INDEX.byId.get(id)!.slot);

    expect(new Set(granted).size).toBe(COSMETIC_SLOTS.length);
  });
});

/* -------------------------------------------------------------------------- */
/* 13.2 — inventory                                                            */
/* -------------------------------------------------------------------------- */

describe("cosmetic inventory (13.2)", () => {
  it("starts a developer with the starter set and nothing else", () => {
    const inventory = initialInventory(USER, AT);

    expect(inventory.userId).toBe(USER);
    expect(ownedItemIds(inventory)).toEqual(new Set(DEFAULT_OWNED_IDS));
    expect(inventory.items.every((item) => item.sourceKind === "default")).toBe(true);
  });

  it("records a grant with the source that granted it", () => {
    const result = grantCosmetic(initialInventory(USER, AT), {
      itemId: "frame-signal",
      sourceKind: "quest",
      sourceId: "weekly-release-1:lifetime",
      acquiredAt: AT,
    });

    expect(result.granted).toBe(true);
    expect(result.inventory.items.find((item) => item.itemId === "frame-signal")).toEqual({
      itemId: "frame-signal",
      sourceKind: "quest",
      sourceId: "weekly-release-1:lifetime",
      acquiredAt: AT,
    });
  });

  it("refuses a second copy of an owned item rather than duplicating it", () => {
    const first = grantCosmetic(initialInventory(USER, AT), {
      itemId: "frame-signal",
      sourceKind: "purchase",
      sourceId: "cc:user-1:cosmetic_purchase:frame-signal",
      acquiredAt: AT,
    });

    const second = grantCosmetic(first.inventory, {
      itemId: "frame-signal",
      sourceKind: "purchase",
      sourceId: "cc:user-1:cosmetic_purchase:frame-signal",
      acquiredAt: "2026-11-01T00:00:00.000Z",
    });

    expect(second.granted).toBe(false);
    expect(second.inventory).toBe(first.inventory);
    expect(second.inventory.items.filter((item) => item.itemId === "frame-signal")).toHaveLength(1);
  });

  it("refuses a second copy even when the source differs", () => {
    // The item is what is owned, not the reason. A grant through another path
    // cannot produce a second copy of a thing already held.
    const first = grantCosmetic(inventoryWith(), {
      itemId: "frame-signal",
      sourceKind: "quest",
      sourceId: "weekly-release-1:lifetime",
      acquiredAt: AT,
    });
    const second = grantCosmetic(first.inventory, {
      itemId: "frame-signal",
      sourceKind: "purchase",
      sourceId: "some-other-source",
      acquiredAt: AT,
    });

    expect(second.granted).toBe(false);
  });

  it("throws for an item the catalog does not publish", () => {
    expect(() =>
      grantCosmetic(inventoryWith(), {
        itemId: "frame-phantom",
        sourceKind: "quest",
        sourceId: "weekly-release-1:lifetime",
        acquiredAt: AT,
      }),
    ).toThrow(/not in the cosmetic catalog/);
  });

  it("keeps two developers' ownerships apart", () => {
    const mine = grantCosmetic(inventoryWith(), {
      itemId: "frame-signal",
      sourceKind: "quest",
      sourceId: "q",
      acquiredAt: AT,
    });
    const theirs = grantCosmetic({ userId: "user-2", items: [] }, {
      itemId: "frame-signal",
      sourceKind: "quest",
      sourceId: "q",
      acquiredAt: AT,
    });

    expect(theirs.inventory.userId).toBe("user-2");
    expect(theirs.inventory.items).toHaveLength(1);
    expect(mine.inventory.items).toHaveLength(1);
  });

  it("applies a quest completion's grant as a quest-sourced grant", () => {
    const result = grantFromQuestCompletion(
      initialInventory(USER, AT),
      {
        id: `inv:${USER}:frame-forge`,
        userId: USER,
        itemId: "frame-forge",
        sourceId: "weekly-release-1:weekly:2026-10-12",
      },
      AT,
    );

    expect(result.granted).toBe(true);
    expect(result.inventory.items.find((item) => item.itemId === "frame-forge")).toEqual({
      itemId: "frame-forge",
      sourceKind: "quest",
      sourceId: "weekly-release-1:weekly:2026-10-12",
      acquiredAt: AT,
    });
  });

  it("keys a grant by user and item, matching the quest grant's own key", () => {
    expect(inventoryKey(USER, "frame-forge")).toBe(`inv:${USER}:frame-forge`);
  });

  it("does not mutate the inventory it was given", () => {
    const before = inventoryWith("frame-minimal");
    const snapshot = JSON.stringify(before);

    grantCosmetic(before, {
      itemId: "frame-signal",
      sourceKind: "quest",
      sourceId: "q",
      acquiredAt: AT,
    });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

/* -------------------------------------------------------------------------- */
/* 13.3 — equipped state                                                       */
/* -------------------------------------------------------------------------- */

describe("equipped cosmetics (13.3)", () => {
  it("equips an owned item", () => {
    const outcome = equipCosmetic(inventoryWith("frame-minimal", "frame-signal"), NOTHING_EQUIPPED, "frame-signal");

    expect(outcome).toEqual({ ok: true, equipped: { frame: "frame-signal" } });
  });

  it("refuses an item the developer does not own", () => {
    const outcome = equipCosmetic(inventoryWith("frame-minimal"), NOTHING_EQUIPPED, "frame-signal");

    expect(outcome).toEqual({ ok: false, refusal: "not_owned" });
  });

  it("refuses an item outside the catalog", () => {
    const outcome = equipCosmetic(inventoryWith("frame-phantom"), NOTHING_EQUIPPED, "frame-phantom");

    expect(outcome).toEqual({ ok: false, refusal: "unknown_item" });
  });

  it("replaces the item already worn in that slot", () => {
    const inventory = inventoryWith("frame-minimal", "frame-signal");
    const worn: EquippedCosmetics = { frame: "frame-minimal" };

    const outcome = equipCosmetic(inventory, worn, "frame-signal");

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.equipped).toEqual({ frame: "frame-signal" });
  });

  it("keeps one item per slot by construction", () => {
    // One key per slot is why two frames cannot be worn at once: the state is a
    // map keyed by slot, so there is no list for two entries to collide in.
    const inventory = inventoryWith("frame-minimal", "frame-signal");
    const first = equipCosmetic(inventory, NOTHING_EQUIPPED, "frame-minimal");
    const second = equipCosmetic(inventory, first.ok ? first.equipped : {}, "frame-signal");

    expect(second.ok).toBe(true);
    if (second.ok) expect(Object.keys(second.equipped)).toHaveLength(1);
  });

  it("leaves other slots untouched when equipping", () => {
    const inventory = inventoryWith("frame-signal", "title-scholar");
    const worn: EquippedCosmetics = { title: "title-builder" };

    const outcome = equipCosmetic(inventory, worn, "frame-signal");

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.equipped).toEqual({ frame: "frame-signal", title: "title-builder" });
    }
  });

  it("is a no-op when the item is already worn", () => {
    const inventory = inventoryWith("frame-signal");
    const worn: EquippedCosmetics = { frame: "frame-signal" };

    expect(equipCosmetic(inventory, worn, "frame-signal")).toEqual({ ok: true, equipped: worn });
  });

  it("unequips a slot without touching the inventory", () => {
    const inventory = inventoryWith("frame-signal");
    const outcome = equipCosmetic(inventory, NOTHING_EQUIPPED, "frame-signal");
    if (!outcome.ok) throw new Error("equip failed");

    expect(unequipCosmetic(outcome.equipped, "frame")).toEqual(NOTHING_EQUIPPED);
    expect(ownsCosmetic(inventory, "frame-signal")).toBe(true);
  });

  it("unequips nothing from an empty slot", () => {
    expect(unequipCosmetic(NOTHING_EQUIPPED, "theme")).toEqual(NOTHING_EQUIPPED);
  });

  it("reports an empty slot as null", () => {
    expect(equippedIn(NOTHING_EQUIPPED, "banner")).toBeNull();
    expect(equippedIn({ banner: "banner-violet" }, "banner")).toBe("banner-violet");
  });

  it("equips the starter set as the starter loadout", () => {
    const inventory = initialInventory(USER, AT);

    const equipped = equipOwnedDefaults(inventory, DEFAULT_OWNED_IDS);

    expect(equipped).toEqual({
      frame: "frame-minimal",
      banner: "banner-graphite",
      title: "title-builder",
      theme: "theme-graphite",
      effect: "effect-none",
    });
  });

  it("equips only items the developer owns", () => {
    const inventory = initialInventory(USER, AT);

    const equipped = equipOwnedDefaults(inventory, [...DEFAULT_OWNED_IDS, "frame-signal"]);

    expect(equipped.frame).toBe("frame-minimal");
  });

  it("does not mutate the equipped map it was given", () => {
    const worn: EquippedCosmetics = { frame: "frame-minimal" };
    const snapshot = JSON.stringify(worn);

    equipCosmetic(inventoryWith("frame-signal"), worn, "frame-signal");

    expect(JSON.stringify(worn)).toBe(snapshot);
  });
});

/* -------------------------------------------------------------------------- */
/* 13.4 — customization view                                                   */
/* -------------------------------------------------------------------------- */

describe("customization view (13.4)", () => {
  const inventory = initialInventory(USER, AT);
  const equipped = equipOwnedDefaults(inventory, DEFAULT_OWNED_IDS);

  it("returns every slot, in the catalog's declared order", () => {
    const view = computeCustomizationView(inventory, equipped);

    expect(view.slots.map((section) => section.slot)).toEqual([...COSMETIC_SLOTS]);
  });

  it("marks the starter items owned and equipped", () => {
    const view = computeCustomizationView(inventory, equipped);
    const frame = view.slots.find((section) => section.slot === "frame")!;
    const minimal = frame.options.find((option) => option.definition.id === "frame-minimal")!;

    expect(minimal).toMatchObject({ owned: true, equipped: true, equippable: false });
  });

  it("shows an unowned item rather than hiding it, with the price carried through", () => {
    const view = computeCustomizationView(inventory, equipped);
    const frame = view.slots.find((section) => section.slot === "frame")!;
    const signal = frame.options.find((option) => option.definition.id === "frame-signal")!;

    expect(signal.owned).toBe(false);
    expect(signal.equipped).toBe(false);
    expect(signal.equippable).toBe(false);
    expect(signal.definition.priceCodeCoins).toBe(250);
  });

  it("marks a different owned item as equippable", () => {
    const ownedBoth = grantCosmetic(inventory, {
      itemId: "frame-signal",
      sourceKind: "purchase",
      sourceId: "cc:user-1:cosmetic_purchase:frame-signal",
      acquiredAt: AT,
    }).inventory;

    const view = computeCustomizationView(ownedBoth, equipped);
    const signal = view.slots
      .find((section) => section.slot === "frame")!
      .options.find((option) => option.definition.id === "frame-signal")!;

    expect(signal).toMatchObject({ owned: true, equipped: false, equippable: true });
  });

  it("reports the equipped definition per slot", () => {
    const view = computeCustomizationView(inventory, equipped);

    expect(view.slots.map((section) => section.equipped?.id ?? null)).toEqual([
      "frame-minimal",
      "banner-graphite",
      "title-builder",
      "theme-graphite",
      "effect-none",
    ]);
  });

  it("counts ownership against the whole catalog", () => {
    const view = computeCustomizationView(inventory, equipped);

    expect(view.ownedCount).toBe(DEFAULT_OWNED_IDS.length);
    expect(view.totalCount).toBe(COSMETIC_DEFINITIONS.length);
  });

  it("names the slots with nothing worn", () => {
    const view = computeCustomizationView(inventory, { frame: "frame-minimal" });

    expect(view.emptySlots).toEqual(["banner", "title", "theme", "effect"]);
  });

  it("renders an equipped item the catalog cannot resolve as an empty slot", () => {
    const view = computeCustomizationView(inventory, { frame: "frame-gone" });
    const frame = view.slots.find((section) => section.slot === "frame")!;

    expect(frame.equipped).toBeNull();
    expect(view.emptySlots).toContain("frame");
  });

  it("leaves no slot unlisted for an empty inventory", () => {
    const view = computeCustomizationView({ userId: USER, items: [] }, NOTHING_EQUIPPED);

    expect(view.ownedCount).toBe(0);
    expect(view.emptySlots).toEqual([...COSMETIC_SLOTS]);
  });

  it("is deterministic for the same input", () => {
    expect(computeCustomizationView(inventory, equipped)).toEqual(
      computeCustomizationView(inventory, equipped),
    );
  });
});