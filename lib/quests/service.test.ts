import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { createInMemoryProgressionStore } from "../db/progression-store";
import { createInMemoryWalletStore, walletBalance } from "../currency/store";
import { claimQuest } from "./service";

const AT = new Date("2026-10-14T09:00:00.000Z");

function merged(id = "pull_request:1"): DeveloperEvent {
  return {
    id,
    kind: "pull_request",
    developerLogin: "octocat",
    developerId: 1,
    repositoryId: 10,
    repositoryFullName: "octocat/hello",
    occurredAt: "2026-10-14T01:00:00.000Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: "https://github.com/octocat/hello/pull/1",
    relevance: "scored",
    limitations: [],
    evidence: { number: 1, action: "merged", merged: true, testFiles: null, headRef: null, baseRef: null },
  } as unknown as DeveloperEvent;
}

function deps() {
  return {
    progression: createInMemoryProgressionStore(),
    wallet: createInMemoryWalletStore(),
  };
}

describe("authenticated quest claims", () => {
  it("refuses an unauthenticated claim", async () => {
    const outcome = await claimQuest({ userId: null, questId: "daily-merge-1", at: AT });

    expect(outcome).toEqual({
      ok: false,
      refusal: "unauthenticated",
      message: "Sign in to claim quests.",
    });
  });

  it("refuses a quest that is not met by the supplied evidence", async () => {
    const stores = deps();
    const outcome = await claimQuest({
      userId: "user-1",
      login: "octocat",
      questId: "daily-merge-1",
      evidence: { events: [] },
      at: AT,
      ...stores,
    });

    expect(outcome).toMatchObject({ ok: false, refusal: "not_met" });
  });

  it("records a successful claim and its rewards", async () => {
    const stores = deps();
    const outcome = await claimQuest({
      userId: "user-1",
      login: "octocat",
      questId: "daily-merge-1",
      evidence: { events: [merged()] },
      at: AT,
      ...stores,
    });

    expect(outcome.ok).toBe(true);
    expect(await stores.progression.completedQuestKeys("user-1")).toContain(
      "quest:user-1:daily-merge-1:daily:2026-10-14",
    );
    expect(await stores.progression.totalXp("user-1")).toBe(50);
    expect(walletBalance(await stores.wallet.read("user-1"))).toBe(5);
  });

  it("does not pay a duplicate claim", async () => {
    const stores = deps();
    const input = {
      userId: "user-1",
      login: "octocat",
      questId: "daily-merge-1",
      evidence: { events: [merged()] },
      at: AT,
      ...stores,
    } as const;

    const first = await claimQuest(input);
    const second = await claimQuest(input);

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, refusal: "already_completed" });
    expect(await stores.progression.totalXp("user-1")).toBe(50);
    expect(walletBalance(await stores.wallet.read("user-1"))).toBe(5);
  });
});
