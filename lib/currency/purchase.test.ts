import { describe, expect, it } from "vitest";

import { initialInventory, ownsCosmetic, type Inventory } from "../cosmetics/inventory";

import { balanceOf, currencyKey, type CurrencyTransaction } from "./ledger";
import { purchaseCosmetic, type PurchaseOutcome } from "./purchase";

const AT = "2026-10-12T09:00:00.000Z";
const USER = "user-1";

/**
 * A funded ledger: a past `adjustment` entry, so the balance is a round number
 * the arithmetic in these tests can be read against.
 */
function funded(amount = 1_000): readonly CurrencyTransaction[] {
  return [
    {
      id: currencyKey(USER, "adjustment", "test-funding"),
      userId: USER,
      amount,
      reason: "adjustment",
      sourceId: "test-funding",
      recordedAt: AT,
    },
  ];
}

function buy(
  itemId: string,
  inventory: Inventory,
  transactions: readonly CurrencyTransaction[],
): PurchaseOutcome {
  return purchaseCosmetic({ userId: USER, itemId, inventory, transactions, at: AT });
}

function starter(): Inventory {
  return initialInventory(USER, AT);
}

describe("purchase flow (14.4)", () => {
  it("grants ownership and charges exactly the price", () => {
    const before = funded();
    const outcome = buy("frame-signal", starter(), before);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.cost).toBe(250);
    expect(ownsCosmetic(outcome.inventory, "frame-signal")).toBe(true);
    expect(balanceOf(outcome.transactions, USER)).toBe(balanceOf(before, USER) - 250);
  });

  it("records the spend as a purchase in the ledger", () => {
    const outcome = buy("frame-signal", starter(), funded());
    if (!outcome.ok) return;

    expect(outcome.transactions.at(-1)).toMatchObject({
      id: `cc:${USER}:cosmetic_purchase:frame-signal`,
      amount: -250,
      reason: "cosmetic_purchase",
      sourceId: "frame-signal",
    });
  });

  it("rejects an insufficient balance", () => {
    const outcome = buy("effect-pulse", starter(), []);

    expect(outcome).toMatchObject({ ok: false, refusal: "insufficient_balance", cost: 900, balance: 0 });
  });

  it("reports how short a purchase is, so the refusal is actionable", () => {
    const outcome = buy("theme-ember", starter(), funded(100));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.balance).toBe(100);
    expect(outcome.cost).toBe(500);
  });

  it("does not deduct twice for a duplicate request", () => {
    const before = funded();
    const first = buy("frame-signal", starter(), before);
    if (!first.ok) throw new Error("first purchase failed");

    const second = buy("frame-signal", first.inventory, first.transactions);

    expect(second).toMatchObject({ ok: false, refusal: "already_owned" });
    expect(balanceOf(first.transactions, USER)).toBe(balanceOf(before, USER) - 250);
  });

  it("charges a repeat of the same request exactly once across many retries", () => {
    let inventory = starter();
    let transactions = funded();
    let charges = 0;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const outcome = buy("frame-signal", inventory, transactions);
      if (outcome.ok) {
        inventory = outcome.inventory;
        transactions = outcome.transactions;
        charges += 1;
      }
    }

    expect(charges).toBe(1);
    expect(transactions.filter((t) => t.reason === "cosmetic_purchase")).toHaveLength(1);
    expect(ownsCosmetic(inventory, "frame-signal")).toBe(true);
  });

  it("refuses a second charge already in the ledger rather than charging again", () => {
    // A charge without the grant: persisted spend, missing ownership. Re-charging
    // is the one response that cannot be defended.
    const orphanLedger: readonly CurrencyTransaction[] = [
      ...funded(),
      {
        id: `cc:${USER}:cosmetic_purchase:frame-signal`,
        userId: USER,
        amount: -250,
        reason: "cosmetic_purchase",
        sourceId: "frame-signal",
        recordedAt: AT,
      },
    ];

    const outcome = buy("frame-signal", starter(), orphanLedger);

    expect(outcome).toMatchObject({ ok: false, refusal: "already_charged" });
  });

  it("refuses a quest reward rather than selling it for its null price", () => {
    const outcome = buy("frame-forge", starter(), funded());

    expect(outcome).toMatchObject({ ok: false, refusal: "not_purchasable", cost: null });
  });

  it("refuses an item the catalog does not publish", () => {
    const outcome = buy("frame-phantom", starter(), funded());

    expect(outcome).toMatchObject({ ok: false, refusal: "unknown_item", cost: null });
  });

  it("keeps one developer's purchase out of another's balance", () => {
    const charged = buy("frame-signal", starter(), funded());
    if (!charged.ok) throw new Error("purchase failed");

    const other = purchaseCosmetic({
      userId: "user-2",
      itemId: "frame-signal",
      inventory: starter(),
      transactions: charged.transactions,
      at: AT,
    });

    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.refusal).toBe("insufficient_balance");
  });

  it("sells the zero-price basics without charging", () => {
    // The starter set is already granted, so reaching here needs an inventory
    // without them — the free-but-owned distinction still has to hold.
    const bare: Inventory = { userId: USER, items: [] };
    const outcome = buy("banner-graphite", bare, []);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.cost).toBe(0);
    expect(balanceOf(outcome.transactions, USER)).toBe(0);
  });
});

describe("purchase flow — a failed transaction leaves the balance intact (14.4)", () => {
  it("writes nothing on a refusal", () => {
    const before = funded(100);
    const snapshot = JSON.stringify(before);
    const inventory = starter();
    const inventorySnapshot = JSON.stringify(inventory);

    const outcome = buy("theme-ember", inventory, before);

    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(JSON.stringify(inventory)).toBe(inventorySnapshot);
  });

  it("returns both writes together, or neither", () => {
    const success = buy("frame-signal", starter(), funded());
    if (!success.ok) throw new Error("purchase failed");

    // Atomicity as a shape: the charge and the grant travel in one outcome, and
    // neither is visible on its own.
    expect(success.transactions).toHaveLength(2);
    expect(ownsCosmetic(success.inventory, "frame-signal")).toBe(true);

    const refusal = buy("theme-ember", starter(), funded(100));
    expect(refusal.ok).toBe(false);
    expect(refusal).not.toHaveProperty("inventory");
    expect(refusal).not.toHaveProperty("transactions");
  });

  it("does not mutate the ledger or the inventory it was given", () => {
    const transactions = funded();
    const inventory = starter();

    purchaseCosmetic({ userId: USER, itemId: "frame-signal", inventory, transactions, at: AT });

    expect(transactions).toHaveLength(1);
    expect(inventory.items).toHaveLength(5);
  });
});