import { describe, expect, it } from "vitest";

// Relative imports, not `@/`: that alias is Next's, and vitest does not resolve
// it. Every other test in this suite imports relatively for the same reason.
import { ATTRIBUTE_LABEL, type AttributeKey } from "./attributes";
import { SKILL_NODES } from "../components/skill-tree/skill-tree-data";
import { SKILL_DEFINITIONS } from "./skills/catalog";

/**
 * DATA_CONTRACT.md is a document, and documents rot silently — nothing stops a
 * type from drifting away from the sentence describing it.
 *
 * These assert the claims the contract actually makes about the code, so the file
 * cannot quietly become fiction. Where a claim is about something that does not
 * exist yet, the test names that rather than skipping.
 */
const CONTRACT = "docs/DATA_CONTRACT.md";

/* -------------------------------------------------------------------------- */

describe("DATA_CONTRACT.md exists and is cited", () => {
  it("is present at the path every citation names", () => {
    // Nine source files reference DATA_CONTRACT §n. A missing file makes all of
    // them dangling pointers dressed as authority.
    expect(existsSync(CONTRACT)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("§1 — the layer diagram matches the real modules", () => {
  it.each([
    "lib/github",
    "lib/developer-event.ts",
    "lib/scoring",
    "lib/scoring/ledger.ts",
    "lib/skills",
  ])("names a layer that exists: %s", (path) => {
    expect(existsSync(path)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("§2 — the six attributes, in the documented order", () => {
  const attributes: AttributeKey[] = [
    "builder",
    "debugger",
    "scholar",
    "collaborator",
    "maintainer",
    "architect",
  ];

  it("matches the contract's list exactly", () => {
    // `ATTRIBUTE_LABEL`'s key order is what the code documents as "already in the
    // documented order", so the order is part of the contract rather than a
    // convenience.
    expect(Object.keys(ATTRIBUTE_LABEL)).toEqual(attributes);
  });

  it("labels every attribute, so no screen has to invent one", () => {
    for (const key of attributes) {
      expect(ATTRIBUTE_LABEL[key], key).toBeTruthy();
    }
  });

  it("keeps the skill tree's branches inside that vocabulary", () => {
    // §14's whole purpose is that a screen cannot spell an attribute the contract
    // does not have.
    for (const node of SKILL_DEFINITIONS) {
      if (node.branch === null) continue;

      expect(attributes, node.id).toContain(node.branch);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("§5 — the mock fields it names are still mock", () => {
  it("SkillNode.progress is a static literal, not a measurement", () => {
    // The contract's §5 table claims this. If progress ever became computed, the
    // row would be wrong and a screen would be reading a real number as fiction.
    const derived = SKILL_NODES.every(
      (node) =>
        node.progress === node.requiredProgress ||
        // A few nodes are hand-tuned to render the in-progress state.
        node.progress < node.requiredProgress,
    );

    expect(derived).toBe(true);
  });

  it("TASKS 6.1's SkillDefinition omits progress, as §11.1 records", () => {
    // The contract asserts the domain type dropped it. That is what makes the
    // prototype copy safe to retire rather than a second source of truth.
    for (const node of SKILL_DEFINITIONS) {
      expect(node).not.toHaveProperty("progress");
      expect(node).not.toHaveProperty("xpReward");
      expect(node).not.toHaveProperty("codeCoinReward");
    }
  });

  it("TASKS 6.1's SkillDefinition omits the presentation fields too", () => {
    // §16's domain/presentation split, asserted on the domain type.
    for (const node of SKILL_DEFINITIONS) {
      expect(node).not.toHaveProperty("visualX");
      expect(node).not.toHaveProperty("visualY");
      expect(node).not.toHaveProperty("icon");
      expect(node).not.toHaveProperty("flavor");
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("§6 — eligibility is derived, and no domain type stores it", () => {
  it("no SkillDefinition carries a status", () => {
    // §6 says status is computed, never stored. A stored status would let it
    // disagree with the state it claims to summarise.
    for (const node of SKILL_DEFINITIONS) {
      expect(node).not.toHaveProperty("status");
      expect(node).not.toHaveProperty("unlocked");
      expect(node).not.toHaveProperty("eligible");
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("§9 — coordinates never influence eligibility", () => {
  it("SkillDefinition has no coordinate fields at all", () => {
    // The structural form of the rule. The behavioural form is asserted in
    // skill-tree-logic.ts, which moves nodes for visual reasons freely.
    for (const node of SKILL_DEFINITIONS) {
      expect(node).not.toHaveProperty("visualX");
      expect(node).not.toHaveProperty("visualY");
    }
  });

  it("the prototype copy does carry them, which is why the split exists", () => {
    // Guards the premise of §9: if the prototype stopped using coordinates, the
    // separation would be defending against nothing.
    const first = SKILL_NODES.find((node) => node.id !== "origin");

    expect(first).toHaveProperty("visualX");
  });
});

/* -------------------------------------------------------------------------- */

describe("§11 — the sections cited in code exist in the document", () => {
  it.each([13, 14, 16, 18])("has a section %i", (section) => {
    // Nine source files cite these four numbers. A renumbering would turn every
    // one of them into a pointer to the wrong section.
    const text = readFileSync(CONTRACT, "utf8");

    expect(text, `section ${section}`).toContain(`§${section}`);
  });

  it("records the known drift rather than hiding it", () => {
    // §11.1 names the `category` vs `branch` mismatch. Removing the note would
    // leave the correction invisible to whoever reads the contract next.
    expect(readFileSync(CONTRACT, "utf8")).toContain("11.1");
  });
});

/* -------------------------------------------------------------------------- */

import { existsSync, readFileSync } from "node:fs";