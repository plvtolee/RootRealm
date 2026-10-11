import { describe, expect, it } from "vitest";

import { SKILL_DEFINITIONS } from "./catalog";
import { indexSkills, validateCatalog, type SkillDefinition } from "./definition";
import {
  dependentsOf,
  evaluateAll,
  evaluatePrerequisites,
  prerequisitesMet,
  shortestPathTo,
} from "./prerequisites";

const INDEX = indexSkills(SKILL_DEFINITIONS);
const node = (id: string) => INDEX.get(id)!;

/* -------------------------------------------------------------------------- */

describe("TASKS 6.2 — missing prerequisite → locked", () => {
  it("declines a node whose prerequisite is not learned", () => {
    const result = evaluatePrerequisites(
      node("builder-roots"),
      new Set<string>(),
    );

    expect(result.satisfied).toBe(false);
    expect(result.missingIds).toEqual(["origin"]);
  });

  it("declines the entire branch from an empty learned set", () => {
    const results = evaluateAll(SKILL_DEFINITIONS, []);

    // Only the Origin can be satisfied with nothing learned — everything else
    // sits behind at least one prerequisite.
    const satisfied = [...results.values()].filter((r) => r.satisfied);

    expect(satisfied.map((r) => r.skillId)).toEqual(["origin"]);
  });

  it("names the specific ids that are missing, so a UI need not guess", () => {
    // SkillNodeStatus renders "Requires X or Y" from this. Under `any` the node
    // is already satisfied here, but the unmet alternative is still reported —
    // a player learns from seeing that either route would work.
    const result = evaluatePrerequisites(
      node("bridge-builder-debugger"),
      new Set(["builder-foundation"]),
    );

    expect(result.satisfied).toBe(true);
    expect(result.missingIds).toEqual(["debugger-foundation"]);
    expect(result.satisfiedIds).toEqual(["builder-foundation"]);
  });

  it("reports the missing ids and blocks when none are met", () => {
    const result = evaluatePrerequisites(
      node("bridge-builder-debugger"),
      new Set(["origin"]),
    );

    expect(result.satisfied).toBe(false);
    expect(result.missingIds).toEqual([
      "builder-foundation",
      "debugger-foundation",
    ]);
    expect(result.satisfiedIds).toEqual([]);
  });
});

describe("TASKS 6.2 — satisfied prerequisite → eligible where other conditions pass", () => {
  it("satisfies a node once its prerequisite is learned", () => {
    expect(
      evaluatePrerequisites(node("builder-roots"), new Set(["origin"])).satisfied,
    ).toBe(true);
  });

  it("satisfies a node when either of two prerequisites is learned (`any`)", () => {
    const result = evaluatePrerequisites(
      node("bridge-builder-debugger"),
      new Set(["origin", "builder-foundation", "debugger-roots"]),
    );

    expect(result.satisfied).toBe(true);
    // The unmet alternative is still reported — the screen shows what else works.
    expect(result.missingIds).toEqual(["debugger-foundation"]);
  });

  it("requires every prerequisite when the node declares `all`", () => {
    const strict: SkillDefinition = {
      ...node("bridge-builder-debugger"),
      prerequisiteMode: "all",
    };

    expect(
      evaluatePrerequisites(
        strict,
        new Set(["origin", "builder-foundation", "debugger-roots"]),
      ).satisfied,
    ).toBe(false);

    expect(
      evaluatePrerequisites(
        strict,
        new Set([
          "origin",
          "builder-foundation",
          "debugger-foundation",
          "debugger-roots",
        ]),
      ).satisfied,
    ).toBe(true);
  });

  it("says only prerequisites are met — never that a node is unlocked", () => {
    /*
     * The acceptance clause's "where other conditions pass" is load-bearing.
     * Prerequisites are one gate; TASKS 6.4 owns the evidence gate. A function
     * returning `true` must not be usable as "unlockable", and returning a
     * `status` here would make that mistake easy.
     */
    const result = evaluatePrerequisites(
      node("builder-roots"),
      new Set(["origin"]),
    );

    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("unlocked");
    expect(result).not.toHaveProperty("eligible");
    expect(Object.keys(result).sort()).toEqual([
      "missingIds",
      "satisfied",
      "satisfiedIds",
      "skillId",
    ]);
  });

  it("cannot report a node unlocked on prerequisites alone", () => {
    // A builder-foundation needs a real merged pull request too. Prerequisites
    // alone say nothing about that, and this module never claims otherwise.
    const result = evaluatePrerequisites(
      node("builder-foundation"),
      new Set(["builder-roots"]),
    );

    expect(result.satisfied).toBe(true);
    // No field here could be read as "ready to learn".
    expect(JSON.stringify(result)).not.toContain("ready");
  });
});

describe("the Origin", () => {
  it("is satisfied with nothing learned", () => {
    expect(evaluatePrerequisites(node("origin"), new Set()).satisfied).toBe(true);
  });

  it("reports no missing ids rather than treating none as failure", () => {
    const result = evaluatePrerequisites(node("origin"), new Set());

    expect(result.missingIds).toEqual([]);
    expect(result.satisfied).toBe(true);
  });

  it("is the only node satisfied from an empty set", () => {
    const satisfied = [...evaluateAll(SKILL_DEFINITIONS, []).values()]
      .filter((r) => r.satisfied)
      .map((r) => r.skillId);

    expect(satisfied).toEqual(["origin"]);
  });
});

describe("evaluateAll", () => {
  it("covers every node in the catalog", () => {
    const results = evaluateAll(SKILL_DEFINITIONS, ["origin"]);

    expect(results.size).toBe(SKILL_DEFINITIONS.length);
  });

  it("unlocks each branch's roots node once the Origin is learned", () => {
    const results = evaluateAll(SKILL_DEFINITIONS, ["origin"]);

    for (const branch of [
      "builder",
      "debugger",
      "scholar",
      "collaborator",
      "maintainer",
      "architect",
    ]) {
      expect(results.get(`${branch}-roots`)?.satisfied, branch).toBe(true);
    }
  });

  it("accepts any iterable, not only a Set", () => {
    expect(evaluateAll(SKILL_DEFINITIONS, ["origin"]).size).toBe(
      SKILL_DEFINITIONS.length,
    );
  });

  it("does not mutate the set it was given", () => {
    const learned = new Set(["origin"]);

    evaluateAll(SKILL_DEFINITIONS, learned);

    expect([...learned]).toEqual(["origin"]);
  });

  it("is deterministic", () => {
    const a = evaluateAll(SKILL_DEFINITIONS, ["origin", "builder-roots"]);
    const b = evaluateAll(SKILL_DEFINITIONS, ["origin", "builder-roots"]);

    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("ignores learned ids that are not in the catalog", () => {
    // A stale unlock record must not crash evaluation or satisfy a real node.
    const results = evaluateAll(SKILL_DEFINITIONS, ["origin", "ghost-node"]);

    expect(results.get("builder-roots")?.satisfied).toBe(true);
  });
});

describe("prerequisitesMet", () => {
  it("answers the single question without the detail", () => {
    expect(prerequisitesMet(node("builder-roots"), new Set(["origin"]))).toBe(true);
    expect(prerequisitesMet(node("builder-roots"), new Set())).toBe(false);
  });
});

describe("dependentsOf — for refund blocking in TASKS 6.5", () => {
  it("finds the nodes a skill gates", () => {
    const dependents = dependentsOf("origin", SKILL_DEFINITIONS);

    // Every branch roots node hangs off the Origin.
    expect(dependents).toHaveLength(6);
    expect(dependents.every((n) => n.prerequisiteIds.includes("origin"))).toBe(true);
  });

  it("returns nothing for a keystone nothing depends on", () => {
    expect(dependentsOf("builder-capstone", SKILL_DEFINITIONS)).toEqual([]);
  });

  it("is mode-agnostic, because a refund must not orphan anything", () => {
    // A node requiring ALL of its prerequisites still depends on this one.
    const strict: SkillDefinition = {
      ...node("bridge-builder-debugger"),
      prerequisiteMode: "all",
    };
    const catalog = [node("builder-foundation"), strict];

    expect(dependentsOf("debugger-foundation", catalog)).toHaveLength(1);
  });
});

describe("shortestPathTo", () => {
  it("returns an empty path for a node already learned", () => {
    expect(shortestPathTo("origin", INDEX, new Set(["origin"]))).toEqual([]);
  });

  it("returns the missing chain for an unreachable-from-nothing node", () => {
    // Learning origin → builder-roots → builder-foundation is three steps.
    const path = shortestPathTo("builder-foundation", INDEX, new Set());

    expect(path).toEqual(["origin", "builder-roots"]);
  });

  it("stops at what is already learned", () => {
    expect(
      shortestPathTo("builder-capstone", INDEX, new Set(["origin", "builder-roots"])),
    ).toEqual(["builder-foundation", "builder-advanced"]);
  });

  it("takes the shorter of two routes", () => {
    // builder-advanced is reachable via builder-foundation alone under `any`,
    // rather than needing the bridge.
    const path = shortestPathTo("builder-advanced", INDEX, new Set(["origin"]));

    expect(path).toEqual(["builder-roots", "builder-foundation"]);
  });

  it("returns null for an unknown target rather than an empty path", () => {
    // An empty path reads as "already learned", which would be a lie.
    expect(shortestPathTo("ghost", INDEX, new Set())).toBeNull();
  });

  it("terminates on a cyclic catalog instead of overflowing the stack", () => {
    // validateCatalog rejects this at construction, but a cycle reaching
    // production should produce a null answer, not a crash that takes the page
    // down with it.
    const cyclic: SkillDefinition[] = [
      node("origin"),
      { ...node("builder-roots"), prerequisiteIds: ["b"], prerequisiteMode: "all" },
      { ...node("builder-foundation"), prerequisiteIds: ["a"] },
    ];
    const index = new Map(
      cyclic.map((n) => [n.id === "builder-roots" ? "b" : n.id === "builder-foundation" ? "a" : n.id, n]),
    );

    expect(() => shortestPathTo("a", index, new Set())).not.toThrow();
    expect(shortestPathTo("a", index, new Set())).toBeNull();
  });
});

describe("against the real catalog", () => {
  it("every node reaches `satisfied` once everything is learned", () => {
    const everything = new Set(SKILL_DEFINITIONS.map((n) => n.id));
    const results = evaluateAll(SKILL_DEFINITIONS, everything);

    for (const [, result] of results) {
      expect(result.satisfied, result.skillId).toBe(true);
    }
  });

  it("the catalog is sound, or the evaluator's answers are meaningless", () => {
    expect(validateCatalog(SKILL_DEFINITIONS)).toEqual([]);
  });

  it("learned skills cannot strand another node in this catalog", () => {
    // Learning in catalog order must reach every node, since each is reachable by
    // learning something already learned. Uses the module's own evaluation rather
    // than re-deriving it, so a mode bug here fails the real function too.
    const learned = new Set<string>(["origin"]);

    for (const current of SKILL_DEFINITIONS) {
      if (prerequisitesMet(current, learned)) learned.add(current.id);
    }

    expect(learned.size).toBe(SKILL_DEFINITIONS.length);
  });
});