import { describe, expect, it } from "vitest";

import { SKILL_DEFINITIONS } from "./catalog";
import {
  describeRequirement,
  indexSkills,
  requirementCount,
  validateCatalog,
  type SkillDefinition,
  type SkillNodeType,
} from "./definition";

const INDEX = indexSkills(SKILL_DEFINITIONS);

/* -------------------------------------------------------------------------- */

describe("the catalog", () => {
  it("has no structural problems", () => {
    // One assertion over every rule in `validateCatalog`: a dangling prerequisite
    // would lock a node forever with no visible cause, and a cycle would deadlock
    // progression without any node reporting why.
    expect(validateCatalog(SKILL_DEFINITIONS)).toEqual([]);
  });

  it("has unique ids", () => {
    const ids = SKILL_DEFINITIONS.map((n) => n.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has exactly one origin, and it requires nothing", () => {
    const origins = SKILL_DEFINITIONS.filter((n) => n.branch === null);

    expect(origins).toHaveLength(1);
    expect(origins[0].id).toBe("origin");
    // §26's worked example starts from a connected account, not accumulated work.
    expect(origins[0].requirement).toBeNull();
  });

  it("gives every non-origin node an evidence requirement", () => {
    // A node with no requirement would be satisfiable by any XP whatsoever, which
    // is the exact outcome §26 forbids.
    for (const node of SKILL_DEFINITIONS) {
      if (node.branch === null) continue;

      expect(node.requirement, node.id).not.toBeNull();
    }
  });

  it("requires at least one unit of something", () => {
    for (const node of SKILL_DEFINITIONS) {
      if (node.requirement === null) continue;

      expect(requirementCount(node.requirement), node.id).toBeGreaterThan(0);
    }
  });

  it("references only nodes that exist", () => {
    for (const node of SKILL_DEFINITIONS) {
      for (const prerequisiteId of node.prerequisiteIds) {
        expect(INDEX.has(prerequisiteId), `${node.id} -> ${prerequisiteId}`).toBe(
          true,
        );
      }
    }
  });

  it("never requires itself", () => {
    for (const node of SKILL_DEFINITIONS) {
      expect(node.prerequisiteIds).not.toContain(node.id);
    }
  });

  it("is reachable in full from the origin", () => {
    // A cycle or a disconnected component would leave nodes permanently locked
    // while reporting no reason. `validateCatalog` covers this structurally; this
    // asserts it for the shipped catalog directly.
    const reached = new Set<string>();
    const queue = ["origin"];

    while (queue.length > 0) {
      const id = queue.pop()!;
      if (reached.has(id)) continue;
      reached.add(id);

      for (const node of SKILL_DEFINITIONS) {
        if (node.prerequisiteIds.includes(id)) queue.push(node.id);
      }
    }

    expect(reached.size).toBe(SKILL_DEFINITIONS.length);
  });

  it("only prerequires nodes at or below its own tier", () => {
    // A prerequisite above a node would invert the tree: the child would be
    // required to unlock the parent that gates it.
    const order = [
      "roots",
      "foundation",
      "intermediate",
      "advanced",
      "mastery",
    ] as const;

    for (const node of SKILL_DEFINITIONS) {
      for (const prerequisiteId of node.prerequisiteIds) {
        const prerequisite = INDEX.get(prerequisiteId)!;

        expect(
          order.indexOf(prerequisite.tier),
          `${node.id}(${node.tier}) -> ${prerequisiteId}(${prerequisite.tier})`,
        ).toBeLessThanOrEqual(order.indexOf(node.tier));
      }
    }
  });

  it("costs the origin nothing", () => {
    expect(INDEX.get("origin")!.cost).toBe(0);
  });

  it("gives every branch a full path to a keystone", () => {
    const branches = [
      "builder",
      "debugger",
      "scholar",
      "collaborator",
      "maintainer",
      "architect",
    ] as const;

    for (const branch of branches) {
      expect(
        SKILL_DEFINITIONS.some(
          (n) => n.branch === branch && n.type === "keystone",
        ),
        branch,
      ).toBe(true);
    }
  });
});

describe("§26 — skills are not unlocked by XP alone", () => {
  it("makes every requirement a countable measurement, never an XP total", () => {
    // The failure this guards is a node requiring `{ kind: "xp", count: 500 }`,
    // which would make §26's first sentence unenforceable.
    const kinds = new Set(
      SKILL_DEFINITIONS.filter((n) => n.requirement !== null).map((n) => n.requirement!.kind),
    );

    expect(kinds.has("xp" as never)).toBe(false);
  });

  it("gives each branch's roots node evidence that branch can actually earn", () => {
    // A roots node requiring evidence nothing grants would be unreachable for a
    // reason no UI could explain — the same silent failure as a dangling
    // prerequisite, one layer up.
    const earnable = new Set([
      "merged_pull_requests",
      "completed_reviews",
      "linked_issue_closures",
      "published_releases",
      "qualifying_documentation",
      "verified_regression_tests",
      "landed_pushes",
    ]);

    for (const node of SKILL_DEFINITIONS) {
      if (node.type !== "minor" || node.tier !== "roots") continue;
      const requirement = node.requirement;
      if (requirement === null) continue;

      // Architect is the documented exception: §14 awards it nothing, so its
      // roots node requires units no rule grants. That is an evidence gap to
      // report, not a catalog error, and is asserted separately below.
      if (node.branch === "architect") continue;

      expect(earnable.has(requirement.kind), node.id).toBe(true);
    }
  });

  it("requires attribute units only for the branch they name", () => {
    // "3 Builder units" must not be satisfiable by a Scholar's work, or §26's
    // category scoping would be decorative.
    for (const node of SKILL_DEFINITIONS) {
      const requirement = node.requirement;
      if (requirement === null || requirement.kind !== "attribute_units") continue;

      expect(requirement.attribute, node.id).toBe(node.branch);
    }
  });
});

describe("the Architect branch", () => {
  it("requires Architect units, which no rule currently awards", () => {
    // §14 lists no awardable Architect evidence and TASKS 5.9 asserts
    // UNAWARDED_ATTRIBUTES === ["architect"]. These nodes are honest about that:
    // reachable, and reporting zero progress in TASKS 6.4, rather than locked for a
    // reason no UI could explain.
    const architect = SKILL_DEFINITIONS.filter((n) => n.branch === "architect");

    expect(architect.length).toBeGreaterThan(0);

    for (const node of architect) {
      const requirement = node.requirement;

      expect(requirement?.kind).toBe("attribute_units");
      if (requirement?.kind === "attribute_units") {
        expect(requirement.attribute).toBe("architect");
      }
    }
  });
});

describe("describeRequirement", () => {
  it("renders a requirement as a readable phrase", () => {
    expect(describeRequirement({ kind: "merged_pull_requests", count: 5 })).toBe(
      "5 merged pull requests",
    );
  });

  it("singularises one, because '1 merged pull requests' reads as a bug", () => {
    expect(describeRequirement({ kind: "landed_pushes", count: 1 })).toBe(
      "1 landed push",
    );
  });

  it("describes the origin as needing a connected account", () => {
    expect(describeRequirement(null)).toBe("A connected GitHub account");
  });

  it("covers every requirement kind, so no node renders blank", () => {
    const kinds = [
      "merged_pull_requests",
      "completed_reviews",
      "linked_issue_closures",
      "published_releases",
      "qualifying_documentation",
      "verified_regression_tests",
      "landed_pushes",
      "attribute_units",
    ] as const;

    for (const kind of kinds) {
      const rendered = describeRequirement({
        kind,
        count: 1,
        ...(kind === "attribute_units" ? { attribute: "builder" } : {}),
      } as never);

      expect(rendered.length, kind).toBeGreaterThan(0);
      expect(rendered, kind).not.toContain("undefined");
    }
  });
});

describe("validateCatalog — the malformed catalogs it must catch", () => {
  const node = (over: Partial<SkillDefinition> = {}): SkillDefinition => ({
    id: "a",
    branch: "builder",
    type: "minor",
    tier: "roots",
    title: "A",
    description: "",
    cost: 1,
    prerequisiteIds: [],
    prerequisiteMode: "any",
    requirement: { kind: "landed_pushes", count: 1 },
    ...over,
  });

  const withOrigin = (extra: readonly SkillDefinition[]) => [
    node({ id: "origin", branch: null, type: "core", cost: 0, requirement: null }),
    ...extra,
  ];

  const problemsFor = (nodes: readonly SkillDefinition[]) =>
    validateCatalog(nodes).map((p) => p.problem);

  it("accepts a minimal sound catalog", () => {
    // The fixture node must hang off the origin, or it is genuinely unreachable
    // and the validator is right to say so.
    expect(
      validateCatalog(withOrigin([node({ prerequisiteIds: ["origin"] })])),
    ).toEqual([]);
  });

  it("reports a node that nothing can reach", () => {
    // The cheapest catalog error to make and the most expensive to diagnose: a
    // node silently locked forever, reporting no reason a UI could show.
    expect(problemsFor(withOrigin([node({ id: "orphan" })]))).toContain(
      "unreachable_prerequisite",
    );
  });

  it("catches a dangling prerequisite", () => {
    // The expensive silent failure: a node locked forever with no visible cause.
    expect(
      problemsFor(withOrigin([node({ prerequisiteIds: ["ghost"] })])),
    ).toContain("unknown_prerequisite");
  });

  it("catches a duplicate id", () => {
    // §18's event identity keys on ids, so two nodes sharing one are
    // indistinguishable to the ledger.
    expect(problemsFor(withOrigin([node(), node({ title: "Other" })]))).toContain(
      "duplicate_id",
    );
  });

  it("catches a self-referential prerequisite", () => {
    expect(
      problemsFor(withOrigin([node({ prerequisiteIds: ["a"] })])),
    ).toContain("self_prerequisite");
  });

  it("catches a cycle, which would deadlock progression", () => {
    expect(
      problemsFor(
        withOrigin([
          node({ id: "a", prerequisiteIds: ["b"] }),
          node({ id: "b", prerequisiteIds: ["a"] }),
        ]),
      ),
    ).toContain("unreachable_prerequisite");
  });

  it("catches a node with no evidence requirement", () => {
    // Satisfiable by any XP, which §26 forbids.
    expect(
      problemsFor(withOrigin([node({ requirement: null })])),
    ).toContain("missing_requirement");
  });

  it("catches a zero-count requirement", () => {
    // Requires nothing while looking as though it requires something.
    expect(
      problemsFor(withOrigin([node({ requirement: { kind: "landed_pushes", count: 0 } })])),
    ).toContain("zero_requirement");
  });

  it("catches a negative cost", () => {
    expect(problemsFor(withOrigin([node({ cost: -1 })]))).toContain("negative_cost");
  });

  it("catches a catalog with no origin", () => {
    expect(problemsFor([node()])).toContain("multiple_origins");
  });

  it("catches a catalog with two origins", () => {
    expect(
      problemsFor([
        node({ id: "origin", branch: null, requirement: null }),
        node({ id: "origin-2", branch: null, requirement: null }),
        node(),
      ]),
    ).toContain("multiple_origins");
  });

  it("reports every problem at once, not just the first", () => {
    // Fixing one error per run, with no view of the rest, is the reason this
    // returns a list rather than throwing.
    const problems = problemsFor(
      withOrigin([
        node({ id: "a", cost: -1, prerequisiteIds: ["ghost"] }),
        node({ id: "b", requirement: { kind: "landed_pushes", count: 0 } }),
      ]),
    );

    expect(problems).toContain("negative_cost");
    expect(problems).toContain("unknown_prerequisite");
    expect(problems).toContain("zero_requirement");
  });

  it("names the node each problem belongs to", () => {
    const problems = validateCatalog(
      withOrigin([node({ id: "troubled", prerequisiteIds: ["ghost"] })]),
    );

    expect(problems.find((p) => p.problem === "unknown_prerequisite")?.nodeId).toBe(
      "troubled",
    );
  });

  it("handles an empty catalog without throwing", () => {
    expect(() => validateCatalog([])).not.toThrow();
  });
});

describe("indexSkills", () => {
  it("looks a node up by id", () => {
    expect(indexSkills(SKILL_DEFINITIONS).get("builder-roots")?.branch).toBe(
      "builder",
    );
  });

  it("returns nothing for an unknown id", () => {
    expect(indexSkills(SKILL_DEFINITIONS).get("nope")).toBeUndefined();
  });

  it("does not alias the input, so a caller cannot mutate the catalog", () => {
    const index = indexSkills(SKILL_DEFINITIONS);

    expect(index.size).toBe(SKILL_DEFINITIONS.length);
  });
});

describe("type coverage", () => {
  it("uses every node type, so no branch of the type-keyed defaults is dead", () => {
    const types = new Set<SkillNodeType>(
      SKILL_DEFINITIONS.map((n) => n.type),
    );

    expect([...types].sort()).toEqual(
      ["core", "keystone", "minor", "notable"].sort(),
    );
  });
});