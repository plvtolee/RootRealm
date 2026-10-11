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

const DESIGN_SYSTEM = "docs/DESIGN_SYSTEM.md";
const ARCHITECTURE = "docs/ARCHITECTURE.md";

describe("DESIGN_SYSTEM.md — the source of truth for visual language", () => {
  /** Section headings, as `# N. Title`. */
  const sections = (path: string): number[] =>
    [...readFileSync(path, "utf8").matchAll(/^# (\d+)\. /gm)]
      .map((match) => Number(match[1]))
      .filter((n) => !Number.isNaN(n));

  it("exists", () => {
    expect(existsSync(DESIGN_SYSTEM)).toBe(true);
  });

  it("defines the spacing scale the token layer implements", () => {
    // §6's list is the same eight values `styles/tokens/space.css` declares, plus
    // the zero every scale needs. If either moved, the token header's own citation
    // of §6 would be wrong.
    const tokens = readFileSync("styles/tokens/space.css", "utf8");
    const px = [...tokens.matchAll(/\/\* (\d+)px \*\//g)].map((m) => Number(m[1]));

    expect(px).toEqual([0, 4, 8, 12, 16, 24, 32, 48, 64]);
  });

  it("still resolves every section AGENTS.md and the tree cite", () => {
    // The failure this guards: a document present but renumbered, so a dozen
    // "DESIGN_SYSTEM §17" references quietly point at the wrong rule.
    const cited = [3, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17, 19, 22, 24, 25, 26, 27, 29, 30, 31, 33];
    const have = sections(DESIGN_SYSTEM);

    for (const section of cited) {
      expect(have, `DESIGN_SYSTEM §${section}`).toContain(section);
    }
  });

  it("keeps the six typography roles §5 names", () => {
    // §5 lists exactly six, and AGENTS.md's Task 1.2 block table depends on that
    // count being six rather than a number that drifts.
    const text = readFileSync(DESIGN_SYSTEM, "utf8");
    const typography = text.slice(text.indexOf("# 5. Typography"), text.indexOf("# 6."));

    for (const role of ["Display", "Heading", "Subheading", "Body", "Caption", "Label"]) {
      expect(typography, role).toContain(role);
    }
  });
});

describe("ARCHITECTURE.md — matches the implementation", () => {
  it("exists", () => {
    expect(existsSync(ARCHITECTURE)).toBe(true);
  });

  it("describes the DeveloperEvent the code actually defines", () => {
    // §7 originally sketched `metadata: Record<string, unknown>` and a `"commit"`
    // kind. The implementation diverged deliberately — a loose bag defeats type
    // checking, and no ingested event carries commits. §7.1 records why; this
    // asserts the corrected body is there, so the drift cannot reappear silently.
    const text = readFileSync(ARCHITECTURE, "utf8");

    expect(text).toContain("DeveloperEventEvidence");
    expect(text).toContain("limitations");
    expect(text).toContain("7.1 Divergence");
  });

  it("records the frontend layout it actually uses", () => {
    // §5 suggested a features/ layer that was never built; §5.1 says so.
    expect(readFileSync(ARCHITECTURE, "utf8")).toContain("5.1 As implemented");
  });

  it("does not claim a `commit` kind survives in the canonical event", () => {
    // The single most consequential divergence: naming the kind `commit` would
    // have invited scoring per-commit volume from data containing no commits.
    const section = readFileSync(ARCHITECTURE, "utf8");
    const asImplemented = section.slice(
      section.indexOf("**As implemented**"),
      section.indexOf("## 7.1"),
    );

    expect(asImplemented).not.toContain('"commit"');
    expect(asImplemented).toContain('"push"');
  });
});

/* -------------------------------------------------------------------------- */

import { existsSync, readFileSync } from "node:fs";