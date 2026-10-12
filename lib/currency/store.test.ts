import { describe, expect, it } from "vitest";

import { ownsCosmetic } from "../cosmetics/inventory";
import { currencyKey, type CurrencyTransaction } from "./ledger";
import { createInMemoryWalletStore, newWallet, walletBalance, walletStore, type Wallet } from "./store";

const AT = "2026-10-12T09:00:00.000Z";
const USER = "user-1";

function funded(amount: number): Wallet {
  const funding: CurrencyTransaction = {
    id: currencyKey(USER, "adjustment", "test"),
    userId: USER,
    amount,
    reason: "adjustment",
    sourceId: "test",
    recordedAt: AT,
  };
  return newWallet(USER, AT, [funding]);
}

describe("the shared store (15.3)", () => {
  it("is the same instance every time, so a page and a route see one wallet", () => {
    // Next compiles each route entry separately; a module-scoped store would give
    // the shop page a different wallet from the shop API and a purchase would
    // vanish between them.
    expect(walletStore()).toBe(walletStore());
  });
});

describe("wallet store (15.3, 15.4)", () => {
  it("gives an unknown developer the starter wallet", async () => {
    const store = createInMemoryWalletStore();
    const wallet = await store.read(USER);

    expect(wallet.userId).toBe(USER);
    expect(wallet.equipped).toEqual({
      frame: "frame-minimal",
      banner: "banner-graphite",
      title: "title-builder",
      theme: "theme-graphite",
      effect: "effect-none",
    });
    expect(walletBalance(wallet)).toBe(0);
  });

  it("charges and grants in one step", async () => {
    const store = createInMemoryWalletStore([funded(1_000)]);

    const outcome = await store.purchase({ userId: USER, itemId: "frame-signal", at: AT });

    expect(outcome.ok).toBe(true);
    const wallet = await store.read(USER);
    expect(ownsCosmetic(wallet.inventory, "frame-signal")).toBe(true);
    expect(walletBalance(wallet)).toBe(750);
  });

  it("writes nothing when the balance is short", async () => {
    const store = createInMemoryWalletStore([funded(10)]);

    const outcome = await store.purchase({ userId: USER, itemId: "frame-signal", at: AT });

    expect(outcome).toMatchObject({ ok: false, refusal: "insufficient_balance" });
    const wallet = await store.read(USER);
    expect(ownsCosmetic(wallet.inventory, "frame-signal")).toBe(false);
    expect(walletBalance(wallet)).toBe(10);
  });

  it("charges a retry once, because the store keeps the first purchase", async () => {
    const store = createInMemoryWalletStore([funded(1_000)]);

    await store.purchase({ userId: USER, itemId: "frame-signal", at: AT });
    const second = await store.purchase({ userId: USER, itemId: "frame-signal", at: AT });

    expect(second).toMatchObject({ ok: false, refusal: "already_owned" });
    expect(walletBalance(await store.read(USER))).toBe(750);
  });

  it("holds under concurrent purchases of the same item", async () => {
    // Two requests in flight at once: the balance must be charged once, because
    // the read-decide-write sequence has no await inside it.
    const store = createInMemoryWalletStore([funded(1_000)]);
    const both = await Promise.all([
      store.purchase({ userId: USER, itemId: "frame-signal", at: AT }),
      store.purchase({ userId: USER, itemId: "frame-signal", at: AT }),
    ]);

    expect(both.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(walletBalance(await store.read(USER))).toBe(750);
  });

  it("charges each of two different items once", async () => {
    const store = createInMemoryWalletStore([funded(1_000)]);

    await store.purchase({ userId: USER, itemId: "frame-signal", at: AT });
    await store.purchase({ userId: USER, itemId: "title-scholar", at: AT });

    expect(walletBalance(await store.read(USER))).toBe(550);
  });

  it("equips an owned item without charging", async () => {
    const store = createInMemoryWalletStore([funded(1_000)]);

    const outcome = await store.equip({ userId: USER, itemId: "frame-minimal" });

    expect(outcome.ok).toBe(true);
    expect(walletBalance(await store.read(USER))).toBe(1_000);
  });

  it("refuses to equip an item the developer does not own", async () => {
    const store = createInMemoryWalletStore([funded(1_000)]);

    const outcome = await store.equip({ userId: USER, itemId: "frame-signal" });

    expect(outcome).toEqual({ ok: false, refusal: "not_owned" });
  });

  it("replaces the slot occupant when a second item is equipped", async () => {
    const store = createInMemoryWalletStore([funded(1_000)]);
    await store.purchase({ userId: USER, itemId: "frame-signal", at: AT });

    await store.equip({ userId: USER, itemId: "frame-minimal" });
    await store.equip({ userId: USER, itemId: "frame-signal" });

    const wallet = await store.read(USER);
    expect(wallet.equipped.frame).toBe("frame-signal");
    // The replaced item is still owned: equipping is not a refund or a loss.
    expect(ownsCosmetic(wallet.inventory, "frame-minimal")).toBe(true);
  });

  it("unequips a slot and keeps the item", async () => {
    const store = createInMemoryWalletStore();

    const equipped = await store.unequip({ userId: USER, slot: "frame" });
    const wallet = await store.read(USER);

    expect(equipped.frame).toBeUndefined();
    expect(ownsCosmetic(wallet.inventory, "frame-minimal")).toBe(true);
  });

  it("keeps two developers' wallets apart", async () => {
    const store = createInMemoryWalletStore([funded(1_000)]);

    await store.purchase({ userId: USER, itemId: "frame-signal", at: AT });
    const other = await store.read("user-2");

    expect(ownsCosmetic(other.inventory, "frame-signal")).toBe(false);
    expect(walletBalance(other)).toBe(0);
  });

  it("buys then equips, the flow TASKS 15.4 names", async () => {
    const store = createInMemoryWalletStore([funded(1_000)]);

    const purchase = await store.purchase({ userId: USER, itemId: "theme-ember", at: AT });
    expect(purchase.ok).toBe(true);

    const equip = await store.equip({ userId: USER, itemId: "theme-ember" });
    expect(equip.ok).toBe(true);

    const wallet = await store.read(USER);
    expect(wallet.equipped.theme).toBe("theme-ember");
    expect(walletBalance(wallet)).toBe(500);
  });
});