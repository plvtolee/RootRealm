import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { balanceOf } from "../currency/ledger";
import { completeQuest, completionKey, isClaimable } from "./completion";
import { QUEST_INDEX } from "./catalog";
import type { QuestDefinition } from "./definition";

function merged(id: string, occurredAt: string): DeveloperEvent {
  return {
    id,
    kind: "pull_request",
    developerLogin: "octocat",
    developerId: 1,
    repositoryId: 10,
    repositoryFullName: "octocat/hello",
    occurredAt,
    visibility: "public",
    confidence: "verified",
    sourceUrl: `https://github.com/octocat/hello/pull/1`,
    relevance: "scored",
    limitations: [],
    evidence: { number: 1, action: "merged", merged: true, testFiles: null, headRef: null, baseRef: null },
  } as unknown as DeveloperEvent;
}

const AT = new Date("2026-10-12T09:00:00.000Z");
const dailyMerge = QUEST_INDEX.byId.get("daily-merge-1")!;
const weeklyRelease = QUEST_INDEX.byId.get("weekly-release-1")!;

/** A store that contains no completions. */
const none: { has: (key: string) => boolean } = { has: () => false };

function complete(
  definition: QuestDefinition,
  events: readonly DeveloperEvent[],
  completedKeys: { has: (key: string) => boolean } = none,
) {
  return completeQuest({
    definition,
    userId: "user-1",
    events,
    at: AT,
    scoringVersionId: "scoring-v1",
    completedKeys,
  });
}

describe("quest completion (12.3)", () => {
  it("refuses a quest the evidence does not meet", () => {
    const outcome = complete(dailyMerge, []);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("not_met");
  });

  it("awards XP and CodeCoins for a met quest", () => {
    const outcome = complete(dailyMerge, [merged("a", "2026-10-12T01:00:00.000Z")]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.xpTransaction?.xp).toBe(dailyMerge.xpReward);
    expect(outcome.result.currencyTransaction?.amount).toBe(dailyMerge.codeCoinReward);
  });

  it("cites the events that met the criterion, and never an empty list", () => {
    const outcome = complete(dailyMerge, [merged("a", "2026-10-12T01:00:00.000Z")]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.completion.evidenceEventIds).toEqual(["a"]);
  });

  it("refuses to fabricate a completion with no citable evidence", () => {
    // A quest whose criterion is met but whose matching events cannot be cited
    // must not produce a record. This is the "without fabricating evidence"
    // clause, exercised directly.
    const unsatisfiable: QuestDefinition = {
      ...dailyMerge,
      criterion: { kind: "attribute_units", attribute: "builder", count: 0 },
    };

    const outcome = complete(unsatisfiable, [merged("a", "2026-10-12T01:00:00.000Z")]);

    // No event contributes to `attribute_units`, so there is nothing to cite.
    // The completion is refused rather than written with an empty evidence list.
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("no_evidence");
  });

  it("refuses a second completion in the same period", () => {
    const events = [merged("a", "2026-10-12T01:00:00.000Z")];
    const key = completionKey("user-1", dailyMerge.id, "daily:2026-10-12");

    const outcome = complete(dailyMerge, events, { has: (k) => k === key });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("already_completed");
  });

  it("allows a daily quest again the next day", () => {
    const key = completionKey("user-1", dailyMerge.id, "daily:2026-10-12");
    const outcome = completeQuest({
      definition: dailyMerge,
      userId: "user-1",
      events: [merged("b", "2026-10-13T01:00:00.000Z")],
      at: new Date("2026-10-13T09:00:00.000Z"),
      scoringVersionId: "scoring-v1",
      completedKeys: { has: (k) => k === key },
    });

    expect(outcome.ok).toBe(true);
  });

  it("grants a cosmetic when the quest declares one", () => {
    const outcome = complete(weeklyRelease, [
      {
        ...merged("r", "2026-10-13T01:00:00.000Z"),
        kind: "release",
        evidence: { action: "published", draft: false },
      } as unknown as DeveloperEvent,
    ]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.cosmeticGrant?.itemId).toBe("frame-forge");
  });

  it("grants no cosmetic when the quest declares none", () => {
    const outcome = complete(dailyMerge, [merged("a", "2026-10-12T01:00:00.000Z")]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.cosmeticGrant).toBeNull();
  });

  it("produces a currency entry that sums to the balance", () => {
    const outcome = complete(dailyMerge, [merged("a", "2026-10-12T01:00:00.000Z")]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.result.currencyTransaction === null) return;

    expect(balanceOf([outcome.result.currencyTransaction], "user-1")).toBe(dailyMerge.codeCoinReward);
  });

  it("keys the completion by period, so a goal cannot be re-completed", () => {
    const goal = QUEST_INDEX.byId.get("goal-merge-50")!;
    const events = Array.from({ length: 50 }, (_, i) => merged(`e${i}`, "2026-05-01T00:00:00.000Z"));

    const first = complete(goal, events);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = complete(goal, events, { has: (k) => k === first.result.completion.id });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.refusal).toBe("already_completed");
  });

  it("reports claimability without producing records", () => {
    expect(isClaimable(dailyMerge, "user-1", [merged("a", "2026-10-12T01:00:00.000Z")], AT, none)).toBe(true);
    expect(isClaimable(dailyMerge, "user-1", [], AT, none)).toBe(false);
  });

  it("is deterministic", () => {
    const events = [merged("a", "2026-10-12T01:00:00.000Z")];
    expect(complete(dailyMerge, events)).toEqual(complete(dailyMerge, events));
  });
});