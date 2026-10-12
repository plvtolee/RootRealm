import { describe, expect, it } from "vitest";

import {
  balanceOf,
  canAfford,
  currencyKey,
  recordCurrencyTransaction,
  statementFor,
  type CurrencyTransaction,
} from "./ledger";

const none = { has: () => false };

function entry(overrides: Partial<CurrencyTransaction> = {}): CurrencyTransaction {
  return {
    id: "cc:user-1:quest_completion:q1",
    userId: "user-1",
    amount: 10,
    reason: "quest_completion",
    sourceId: "q1",
    recordedAt: "2026-10-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("currency ledger (14.1)", () => {
  it("builds the idempotency key", () => {
    expect(currencyKey("user-1", "quest_completion", "q1")).toBe("cc:user-1:quest_completion:q1");
  });

  it("records an entry", () => {
    const recorded = recordCurrencyTransaction(
      { userId: "user-1", amount: 10, reason: "quest_completion", sourceId: "q1", recordedAt: "t" },
      none,
    );

    expect(recorded?.amount).toBe(10);
    expect(recorded?.id).toBe("cc:user-1:quest_completion:q1");
  });

  it("refuses a duplicate by idempotency key, so a retry cannot double-grant", () => {
    const recorded = recordCurrencyTransaction(
      { userId: "user-1", amount: 10, reason: "quest_completion", sourceId: "q1", recordedAt: "t" },
      { has: (key) => key === "cc:user-1:quest_completion:q1" },
    );

    expect(recorded).toBeNull();
  });

  it("refuses a zero-amount entry as ledger noise", () => {
    expect(
      recordCurrencyTransaction(
        { userId: "user-1", amount: 0, reason: "adjustment", sourceId: "noop", recordedAt: "t" },
        none,
      ),
    ).toBeNull();
  });
});

describe("balance (14.2)", () => {
  it("sums a developer's entries only", () => {
    const ledger = [
      entry({ amount: 30 }),
      entry({ id: "b", amount: -10, reason: "cosmetic_purchase", sourceId: "frame" }),
      entry({ id: "c", userId: "user-2", amount: 999 }),
    ];

    expect(balanceOf(ledger, "user-1")).toBe(20);
    expect(balanceOf(ledger, "user-2")).toBe(999);
  });

  it("is zero for a developer with no entries", () => {
    expect(balanceOf([], "user-1")).toBe(0);
  });

  it("floors at zero rather than presenting a negative balance", () => {
    const ledger = [entry({ amount: -50, reason: "cosmetic_purchase", sourceId: "x" })];
    expect(balanceOf(ledger, "user-1")).toBe(0);
  });

  it("orders a statement newest first", () => {
    const ledger = [
      entry({ id: "old", recordedAt: "2026-01-01T00:00:00.000Z" }),
      entry({ id: "new", recordedAt: "2026-10-01T00:00:00.000Z" }),
    ];

    const statement = statementFor(ledger, "user-1");
    expect(statement.entries.map((e) => e.id)).toEqual(["new", "old"]);
    expect(statement.balance).toBe(20);
  });

  it("decides affordability without writing", () => {
    const ledger = [entry({ amount: 30 })];

    expect(canAfford(ledger, "user-1", 30)).toBe(true);
    expect(canAfford(ledger, "user-1", 31)).toBe(false);
    expect(canAfford(ledger, "user-1", -1)).toBe(false);
  });
});