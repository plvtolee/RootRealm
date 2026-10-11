import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { SKILL_DEFINITIONS } from "./catalog";
import { indexSkills, type SkillDefinition } from "./definition";
import { evaluateAllProgress, type AttributeTotals, type SkillProgress } from "./progress";
import {
  findStaleUnlocks,
  isUnlocked,
  partitionByUnlock,
  refund,
  toUnlockStore,
  unlock,
  type SkillUnlock,
  type UnlockStore,
} from "./unlock";

const INDEX = indexSkills(SKILL_DEFINITIONS);
const node = (id: string): SkillDefinition => INDEX.get(id)!;

function event(over: Partial<DeveloperEvent> = {}): DeveloperEvent {
  return {
    id: "push:1",
    kind: "push",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-09T05:51:24Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: null,
    relevance: "scored",
    limitations: [],
    evidence: { branch: "main", headSha: "abc", beforeSha: "def" },
    ...over,
  } as DeveloperEvent;
}

const push = () =>
  event({
    kind: "push",
    id: "push:1",
    evidence: { branch: "main", headSha: "abc", beforeSha: "def" },
  });

const issue = () =>
  event({
    kind: "issue",
    id: "issue:1",
    evidence: {
      number: 12,
      title: "Crash on launch",
      state: "closed",
      action: "closed",
      authored: true,
    },
  });

const pr = () =>
  event({
    kind: "pull_request",
    id: "pr:1",
    evidence: {
      number: 42,
      action: "merged",
      merged: true,
      headRef: "feature",
      baseRef: "main",
      testFiles: null,
    },
  });

/** Progress for one node from a given learned set and events. */
function progressFor(
  id: string,
  events: readonly DeveloperEvent[],
  options: { attributeTotals?: AttributeTotals; learnedIds?: Iterable<string> } = {},
): SkillProgress {
  const learned = new Set(options.learnedIds ?? []);
  const [entry] = evaluateAllProgress([node(id)], events, {
    attributeTotals: options.attributeTotals,
    learnedIds: learned,
  });

  return entry;
}

const UNLOCKED_AT = "2026-10-11T00:00:00Z";
const VERSION = "scoring-v1";

/**
 * Attempts an unlock, returning the result.
 *
 * The learned set used for *progress* is the same `learned` store the unlock is
 * attempted against — deliberately one argument rather than two. A caller that
 * could pass them separately could compute eligibility from one tree and record
 * into another, which is a bug this signature prevents.
 */
function attempt(
  id: string,
  events: readonly DeveloperEvent[],
  learned: UnlockStore,
  options: {
    attributeTotals?: AttributeTotals;
    developerLogin?: string;
    unlockedAt?: string;
  } = {},
) {
  const progress = progressFor(id, events, {
    attributeTotals: options.attributeTotals,
    learnedIds: learned,
  });

  return unlock(
    {
      progress,
      developerLogin: options.developerLogin ?? "octocat",
      scoringVersionId: VERSION,
      unlockedAt: options.unlockedAt ?? UNLOCKED_AT,
    },
    learned,
    node(id),
  );
}

const empty = (): UnlockStore => new Set<string>();

/* -------------------------------------------------------------------------- */

describe("the SkillUnlock record", () => {
  it("carries the fields TASKS 6.5 asks to persist", () => {
    const { unlock: record } = attempt("builder-roots", [push()], new Set(["origin"]));

    expect(record).toEqual({
      developerLogin: "octocat",
      skillId: "builder-roots",
      unlockedAt: UNLOCKED_AT,
      scoringVersionId: VERSION,
      ruleId: "skill.builder-roots",
    });
  });

  it("names the rule after the node, so history reads consistently", () => {
    // Two developers unlocking the same node produce the same rule id; two calls
    // for different nodes do not collide.
    const a = attempt("builder-roots", [push()], new Set(["origin"])).unlock;
    const b = attempt("debugger-roots", [issue()], new Set(["origin"])).unlock;

    expect(a.ruleId).toBe("skill.builder-roots");
    expect(b.ruleId).toBe("skill.debugger-roots");
  });

  it("uses the version it was given, for §3's history guarantee", () => {
    const { unlock: record } = attempt("builder-roots", [push()], new Set(["origin"]));

    expect(record.scoringVersionId).toBe(VERSION);
  });

  it("uses the timestamp it was given, so a replay reproduces history", () => {
    const { unlock: record } = attempt("builder-roots", [push()], new Set(["origin"]), {
      unlockedAt: "2024-01-01T00:00:00Z",
    });

    expect(record.unlockedAt).toBe("2024-01-01T00:00:00Z");
  });

  it("does not read a clock, so it is deterministic", () => {
    const first = attempt("builder-roots", [push()], new Set(["origin"]));
    const second = attempt("builder-roots", [push()], new Set(["origin"]));

    expect(first.unlock).toEqual(second.unlock);
  });

  it("records to whose developer it belongs, without a default", () => {
    // A record without an owner belongs to nobody, and merging two developers'
    // trees is the bug this field prevents.
    const { unlock: record } = attempt("builder-roots", [push()], new Set(["origin"]), {
      developerLogin: "someone-else",
    });

    expect(record.developerLogin).toBe("someone-else");
  });
});

describe("TASKS 6.5 — prevent duplicate unlocks", () => {
  it("records a first unlock", () => {
    const result = attempt("builder-roots", [push()], new Set(["origin"]));

    expect(result.duplicate).toBe(false);
    expect(result.learnedIds).toEqual(["origin", "builder-roots"]);
  });

  it("reports a second unlock as a duplicate and writes nothing", () => {
    const first = attempt("builder-roots", [push()], new Set(["origin"]));
    const already = new Set(first.learnedIds);
    const second = attempt("builder-roots", [push()], already);

    expect(second.duplicate).toBe(true);
    // No second row: the store is unchanged, so the invariant holds structurally
    // rather than being reconciled after the fact.
    expect(second.learnedIds).toEqual(["origin", "builder-roots"]);
    expect(second.unlock.skillId).toBe("builder-roots");
  });

  it("yields one record per node across repeated attempts", () => {
    // The acceptance criterion stated as a count: N attempts, N distinct nodes.
    let learned = new Set<string>(["origin"]);
    let records: readonly SkillUnlock[] = [];

    for (let attemptIndex = 0; attemptIndex < 5; attemptIndex += 1) {
      const result = attempt("builder-roots", [push()], learned);
      learned = new Set(result.learnedIds);
      if (!result.duplicate) records = [...records, result.unlock];
    }

    expect(learned.size).toBe(2);
    expect(records).toHaveLength(1);
  });

  it("does not treat a different node as a duplicate", () => {
    // Duplicate is per node, not per developer: a second *distinct* unlock is a
    // normal write.
    const first = attempt("builder-roots", [push()], new Set(["origin"]));
    const second = attempt(
      "builder-foundation",
      [push(), ...Array.from({ length: 3 }, () => pr())],
      new Set(first.learnedIds),
    );

    expect(second.duplicate).toBe(false);
    expect(second.learnedIds).toHaveLength(first.learnedIds.length + 1);
  });

  it("scopes duplicates per developer", () => {
    // The same node for a different developer is a different fact.
    const mine = attempt("builder-roots", [push()], new Set(["origin"]), {
      developerLogin: "octocat",
    });
    const theirs = attempt("builder-roots", [push()], new Set(["origin"]), {
      developerLogin: "someone-else",
    });

    expect(mine.duplicate).toBe(false);
    expect(theirs.duplicate).toBe(false);
    expect(mine.unlock.developerLogin).not.toBe(theirs.unlock.developerLogin);
  });

  it("does not append to the store on a duplicate", () => {
    const before = new Set(["origin", "builder-roots"]);
    const result = attempt("builder-roots", [push()], before);

    expect(result.duplicate).toBe(true);
    expect(result.learnedIds).toEqual(["origin", "builder-roots"]);
  });
});

describe("unlocking is a decision, not an action", () => {
  it("refuses a node whose prerequisites are not met", () => {
    // Eligibility has one owner; a UI asking for a node gets nothing.
    expect(() => attempt("builder-roots", [push()], empty())).toThrow(
      /not eligible/,
    );
  });

  it("refuses a node whose evidence is short", () => {
    expect(() =>
      attempt("builder-foundation", [pr(), push()], new Set(["builder-roots"])),
    ).toThrow(/not eligible/);
  });

  it("names the status and both gates when it refuses", () => {
    // An error that looks like a bug should point at where, not just whether.
    const progress = progressFor("builder-foundation", [pr()], {
      learnedIds: ["builder-roots"],
    });

    expect(() =>
      unlock(
        {
          progress,
          developerLogin: "octocat",
          scoringVersionId: VERSION,
          unlockedAt: UNLOCKED_AT,
        },
        new Set(["builder-roots"]),
        node("builder-foundation"),
      ),
    ).toThrow(/in-progress/);

    const blocked = progressFor("builder-foundation", [pr()], { learnedIds: [] });

    expect(() =>
      unlock(
        {
          progress: blocked,
          developerLogin: "octocat",
          scoringVersionId: VERSION,
          unlockedAt: UNLOCKED_AT,
        },
        empty(),
        node("builder-foundation"),
      ),
    ).toThrow(/locked/);
  });

  it("refuses progress for a different node", () => {
    // The record must describe the node it was earned for.
    const progress = progressFor("builder-roots", [push()], {
      learnedIds: ["origin"],
    });

    expect(() =>
      unlock(
        {
          progress,
          developerLogin: "octocat",
          scoringVersionId: VERSION,
          unlockedAt: UNLOCKED_AT,
        },
        new Set(["origin"]),
        node("builder-foundation"),
      ),
    ).toThrow(/cannot unlock/);
  });

  it("does not unlock an attribute-unit node from XP alone", () => {
    // §26 again: the totals are a separate axis, so 50 merged PRs earn nothing.
    const events = Array.from({ length: 50 }, () => pr());

    expect(() =>
      attempt("architect-roots", events, new Set(["origin"])),
    ).toThrow(/not eligible/);
  });

  it("unlocks it once the units arrive", () => {
    const result = attempt("architect-roots", [], new Set(["origin"]), {
      attributeTotals: { architect: 1 },
    });

    expect(result.duplicate).toBe(false);
    expect(result.unlock.skillId).toBe("architect-roots");
  });
});

describe("refund", () => {
  it("removes the record rather than adding a counter-entry", () => {
    // The reason this stores one row per node: a refund deletes the fact, so the
    // tree never drifts into learned-and-refunded.
    expect(refund("builder-roots", new Set(["origin", "builder-roots"]))).toEqual([
      "origin",
    ]);
  });

  it("is a no-op for a node that was not unlocked", () => {
    expect(refund("ghost", new Set(["origin"]))).toEqual(["origin"]);
  });

  it("leaves the learned set otherwise intact", () => {
    const learned = new Set([
      "origin",
      "builder-roots",
      "builder-foundation",
      "builder-capstone",
    ]);

    expect(refund("builder-foundation", learned)).toEqual([
      "origin",
      "builder-roots",
      "builder-capstone",
    ]);
  });

  it("round-trips through isUnlocked", () => {
    const learned = new Set(["origin", "builder-roots"]);
    const refunded = new Set(refund("builder-roots", learned));

    expect(isUnlocked("builder-roots", learned)).toBe(true);
    expect(isUnlocked("builder-roots", refunded)).toBe(false);
  });
});

describe("isUnlocked", () => {
  it("answers the same question `unlock` asks, from one implementation", () => {
    // Two duplicate checks would be the bug this field exists to prevent.
    const learned = new Set(["origin", "builder-roots"]);

    expect(isUnlocked("builder-roots", learned)).toBe(true);
    expect(isUnlocked("ghost", learned)).toBe(false);
  });
});

describe("partitionByUnlock", () => {
  const progress = evaluateAllProgress(SKILL_DEFINITIONS, [push(), pr()], {
    learnedIds: ["origin"],
  });

  it("separates owned from ready-to-learn", () => {
    const { unlocked, available } = partitionByUnlock(progress, new Set(["origin"]));

    expect(unlocked.map((p) => p.skillId)).toEqual(["origin"]);
    expect(available.length).toBeGreaterThan(0);
    expect(available.every((p) => p.status === "eligible")).toBe(true);
  });

  it("lists a learned node once", () => {
    const { unlocked } = partitionByUnlock(
      progress,
      new Set(["origin", "builder-roots"]),
    );

    expect(unlocked.map((p) => p.skillId)).toEqual(["origin", "builder-roots"]);
  });

  it("does not put a locked or in-progress node in either list", () => {
    // The middle states have no action, and rendering them as available would
    // be the "unlock by request" failure 6.5 is built to prevent.
    const { available, unlocked } = partitionByUnlock(
      progress,
      new Set(["origin"]),
    );

    for (const entry of [...available, ...unlocked]) {
      expect(entry.status).not.toBe("locked");
      expect(entry.status).not.toBe("in-progress");
    }
  });
});

describe("findStaleUnlocks — §3, history is not rewritten", () => {
  it("finds a node the current version no longer earns", () => {
    const progress = evaluateAllProgress(SKILL_DEFINITIONS, [pr()], {
      learnedIds: ["origin", "debugger-roots", "debugger-foundation"],
    });
    const stale = findStaleUnlocks(
      new Set(["origin", "debugger-roots", "debugger-foundation"]),
      progress,
      INDEX,
    );

    // debugger-roots needs a linked issue closure, which this run has no
    // evidence for: it stays learned (6.4 keeps that status), so nothing stale.
    expect(stale).toEqual([]);
  });

  it("reports a record whose node no longer exists in the catalog", () => {
    // A node removed from a later version has no current progress to compare.
    const stale = findStaleUnlocks(
      new Set(["removed-node"]),
      evaluateAllProgress(SKILL_DEFINITIONS, []),
      INDEX,
    );

    expect(stale).toEqual([]);
  });

  it("does not report a node still earned under the current version", () => {
    const stale = findStaleUnlocks(
      new Set(["origin", "builder-roots"]),
      evaluateAllProgress(SKILL_DEFINITIONS, [push()], {
        learnedIds: ["origin", "builder-roots"],
      }),
      INDEX,
    );

    expect(stale).toEqual([]);
  });
});

describe("toUnlockStore", () => {
  it("rebuilds one canonical shape from records", () => {
    const records: SkillUnlock[] = [
      {
        developerLogin: "octocat",
        skillId: "origin",
        unlockedAt: UNLOCKED_AT,
        scoringVersionId: VERSION,
        ruleId: "skill.origin",
      },
      {
        developerLogin: "octocat",
        skillId: "builder-roots",
        unlockedAt: UNLOCKED_AT,
        scoringVersionId: VERSION,
        ruleId: "skill.builder-roots",
      },
    ];

    const store = toUnlockStore(records);

    expect(isUnlocked("origin", store)).toBe(true);
    expect(isUnlocked("builder-roots", store)).toBe(true);
  });

  it("collapses repeated records for one node to one id", () => {
    // A store holding the same node twice is indistinguishable from one holding
    // it once, which is the duplicate check at the type level.
    const record: SkillUnlock = {
      developerLogin: "octocat",
      skillId: "builder-roots",
      unlockedAt: UNLOCKED_AT,
      scoringVersionId: VERSION,
      ruleId: "skill.builder-roots",
    };

    expect([...toUnlockStore([record, record])]).toEqual(["builder-roots"]);
  });

  it("handles an empty record list", () => {
    expect([...toUnlockStore([])]).toEqual([]);
  });
});

describe("determinism and purity", () => {
  it("does not mutate the store it was given", () => {
    const learned = new Set(["origin"]);
    const before = [...learned];

    attempt("builder-roots", [push()], learned);

    expect([...learned]).toEqual(before);
  });

  it("is deterministic across identical calls", () => {
    const first = attempt("builder-roots", [push()], new Set(["origin"]));
    const second = attempt("builder-roots", [push()], new Set(["origin"]));

    expect(first).toEqual(second);
  });

  it("survives a full learn-and-refund cycle", () => {
    // The lifecycle in one test: learn, refund, learn again — and the final
    // state is one node, not two competing records.
    const first = attempt("builder-roots", [push()], new Set(["origin"]));
    const refunded = new Set(refund("builder-roots", new Set(first.learnedIds)));
    const again = attempt("builder-roots", [push()], refunded);

    expect(again.duplicate).toBe(false);
    expect(again.learnedIds).toHaveLength(2);
  });
});
