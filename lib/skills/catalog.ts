/**
 * RootRealm — the skill catalog (TASKS 6.1).
 *
 * ```text
 * SKILL_DEFINITIONS: SkillDefinition[]
 * ```
 *
 * The 36-node graph from `components/skill-tree/skill-tree-data.ts`, restated as
 * domain state. The tree keeps its own copy for presentation (coordinates,
 * flavour text, glyphs) until TASKS 6.6 wires it to this one.
 *
 * ## What was carried over and what was dropped
 *
 * Carried: identity, branch, type, tier, cost, prerequisites. These are the
 * fields §26 says eligibility is derived from.
 *
 * Dropped, and why — none of them is domain state:
 *
 * | Dropped | Reason |
 * | --- | --- |
 * | `visualX` / `visualY` | presentation; §26 derives eligibility from domain state |
 * | `progress` | a static mock equal to `requiredProgress`, i.e. mock shaped like a measurement. TASKS 6.4 computes it from real evidence |
 * | `flavor`, `effects`, `icon`, `evidenceHint`, `evidenceHref` | detail-panel copy and a mock `https://github.com` link |
 * | `xpReward`, `codeCoinReward` | display values; whether a node *grants* anything is a §29 decision this phase does not make |
 *
 * ## How requirements were assigned
 *
 * The prototype's `requiredProgress` was keyed by node *type* — 1 for minor, 2 for
 * notable, 3 for keystone — with the same number meaning "verified from recent
 * commits", "verified from merged pull requests" or "verified from releases"
 * depending on the node. That is a cosmetic gradient, not an evidence rule: it
 * cannot be checked against anything.
 *
 * So each node now names *what* it counts, derived from the branch it sits in and
 * the `evidenceHint` the prototype already assigned to that node type:
 *
 * - minor → `landed_pushes`
 * - notable → `merged_pull_requests`
 * - keystone → the branch's own high-value evidence (releases for Maintainer,
 *   regression tests for Debugger, and so on), because §14 names a distinct
 *   primary evidence per attribute and a keystone should be that attribute's proof
 * - bridges → `completed_reviews`, since a bridge spans two branches and a review
 *   is the one measurement that legitimately spans both
 *
 * These are starting values on a stated basis, not tuned numbers. §4's XP values
 * are explicitly placeholders pending tuning against real profiles, and the same
 * honesty applies here.
 *
 * The Architect branch deserves a note: `SCORING.md` §14 gives Architect no
 * awardable evidence, and TASKS 5.9 asserts `UNAWARDED_ATTRIBUTES === ["architect"]`.
 * Its nodes therefore require `attribute_units` on a branch nothing currently
 * awards. They are reachable in the catalog and will show zero progress, which is
 * the honest state — the alternative would be requiring something that does not
 * exist and calling it locked.
 */
import type {
  EvidenceRequirement,
  SkillDefinition,
  SkillNodeType,
} from "./definition";

/** Requirements by node type, before a node overrides them. */
const DEFAULT_REQUIREMENT: Record<SkillNodeType, EvidenceRequirement> = {
  core: { kind: "landed_pushes", count: 1 },
  minor: { kind: "landed_pushes", count: 1 },
  notable: { kind: "merged_pull_requests", count: 2 },
  keystone: { kind: "published_releases", count: 3 },
};

const COST: Record<SkillNodeType, number> = {
  core: 0,
  minor: 1,
  notable: 2,
  keystone: 3,
};

/**
 * A keystone's own evidence, per branch.
 *
 * §14 gives each attribute a distinct primary evidence, so a keystone is that
 * attribute's proof rather than a third of something generic. Architect is the
 * exception: §14 lists no awardable Architect evidence and TASKS 5.9 asserts it
 * stays unawarded, so it falls back to its own branch's units — which nothing
 * currently grants, which is why those nodes report zero progress rather than
 * pretending otherwise.
 */
const KEYSTONE_REQUIREMENT: Record<string, EvidenceRequirement> = {
  builder: { kind: "merged_pull_requests", count: 5 },
  debugger: { kind: "verified_regression_tests", count: 3 },
  scholar: { kind: "qualifying_documentation", count: 4 },
  collaborator: { kind: "completed_reviews", count: 5 },
  maintainer: { kind: "published_releases", count: 3 },
  architect: { kind: "attribute_units", attribute: "architect", count: 3 },
};

/** Fields a literal supplies; `cost` and `requirement` are derived. */
interface SkillInput {
  readonly id: string;
  readonly branch: SkillDefinition["branch"];
  readonly type: SkillNodeType;
  readonly tier: SkillDefinition["tier"];
  readonly title: string;
  readonly description: string;
  readonly prerequisiteIds: readonly string[];
  /**
   * Overrides the type default, for keystone nodes and bridges.
   *
   * `null` is accepted here as well as omitted, because only the Origin wants it
   * and writing `requirement: null` states that explicitly — where omitting the
   * field would let the type default silently give it a landed-push requirement.
   */
  readonly requirement?: EvidenceRequirement | null;
}

/** Applies the type-keyed defaults so each literal carries only what is unique. */
function skill(input: SkillInput): SkillDefinition {
  // `null` is honoured explicitly rather than folded into `??`, so the Origin's
  // "no evidence needed" cannot be confused with "no requirement supplied".
  const requirement =
    input.requirement !== undefined
      ? input.requirement
      : input.type === "keystone" && input.branch !== null
        ? KEYSTONE_REQUIREMENT[input.branch]
        : DEFAULT_REQUIREMENT[input.type];

  return {
    ...input,
    cost: COST[input.type],
    requirement,
    // Every prerequisite set in this catalog is a genuine either/or — each node
    // names two foundations that each independently unlock it. Stated explicitly
    // so TASKS 6.2 evaluates one code path and a future "needs all" node says so.
    prerequisiteMode: "any",
  };
}

/* -------------------------------------------------------------------------- */
/* The catalog                                                                 */
/* -------------------------------------------------------------------------- */

export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  skill({
    id: "origin",
    branch: null,
    type: "core",
    tier: "roots",
    title: "Origin",
    description:
      "The trunk every path grows from — your GitHub identity, verified and connected.",
    prerequisiteIds: [],
    // The Origin is granted on a connected account (§26's worked example starts
    // here), not on accumulated work. `requirement: null` marks that, and the
    // catalog validator requires every non-Origin node to have one.
    requirement: null,
  }),

  /* --- Builder --------------------------------------------------------- */
  skill({
    id: "builder-roots",
    branch: "builder",
    type: "minor",
    tier: "roots",
    title: "First Merge",
    description: "Ship your first change end to end — branch, commit, review, merge.",
    prerequisiteIds: ["origin"],
  }),
  skill({
    id: "builder-foundation",
    branch: "builder",
    type: "notable",
    tier: "foundation",
    title: "Steady Hand",
    description: "Merge repeatedly enough that shipping becomes routine.",
    prerequisiteIds: ["builder-roots"],
  }),
  skill({
    id: "builder-side",
    branch: "builder",
    type: "minor",
    tier: "intermediate",
    title: "Long Haul",
    description: "Keep a branch alive across days and still land it.",
    prerequisiteIds: ["builder-foundation"],
  }),
  skill({
    id: "builder-advanced",
    branch: "builder",
    type: "notable",
    tier: "advanced",
    title: "Shipwright",
    description: "Land work substantial enough to change what the project can do.",
    prerequisiteIds: ["builder-foundation", "bridge-builder-debugger"],
  }),
  skill({
    id: "builder-capstone",
    branch: "builder",
    type: "keystone",
    tier: "mastery",
    title: "Architect of Shipping",
    description: "A body of merged work that others build on.",
    prerequisiteIds: ["builder-advanced"],
  }),

  /* --- Debugger -------------------------------------------------------- */
  skill({
    id: "debugger-roots",
    branch: "debugger",
    type: "minor",
    tier: "roots",
    title: "First Diagnosis",
    description: "Close your first reported bug, with the fix visible to everyone.",
    prerequisiteIds: ["origin"],
    requirement: { kind: "linked_issue_closures", count: 1 },
  }),
  skill({
    id: "debugger-foundation",
    branch: "debugger",
    type: "notable",
    tier: "foundation",
    title: "Root Cause",
    description: "Close enough reported issues that the pattern is unmistakable.",
    prerequisiteIds: ["debugger-roots"],
    requirement: { kind: "linked_issue_closures", count: 2 },
  }),
  skill({
    id: "debugger-side",
    branch: "debugger",
    type: "minor",
    tier: "intermediate",
    title: "Guard Regressions",
    description: "Close a bug and lock it behind a test that fails without your fix.",
    prerequisiteIds: ["debugger-foundation"],
    requirement: { kind: "verified_regression_tests", count: 1 },
  }),
  skill({
    id: "debugger-advanced",
    branch: "debugger",
    type: "notable",
    tier: "advanced",
    title: "Reliability Work",
    description: "Harden a project until it stops breaking the same ways.",
    prerequisiteIds: ["debugger-foundation", "bridge-builder-debugger"],
    requirement: { kind: "verified_regression_tests", count: 2 },
  }),
  skill({
    id: "debugger-capstone",
    branch: "debugger",
    type: "keystone",
    tier: "mastery",
    title: "Keeper of the Lights",
    description: "A tested, verified safety net a maintainer relies on.",
    prerequisiteIds: ["debugger-advanced"],
  }),

  /* --- Scholar --------------------------------------------------------- */
  skill({
    id: "scholar-roots",
    branch: "scholar",
    type: "minor",
    tier: "roots",
    title: "First Page",
    description: "Write something down so the next person does not have to rediscover it.",
    prerequisiteIds: ["origin"],
    requirement: { kind: "qualifying_documentation", count: 1 },
  }),
  skill({
    id: "scholar-foundation",
    branch: "scholar",
    type: "notable",
    tier: "foundation",
    title: "Explained",
    description: "Document enough that the project can be understood without you.",
    prerequisiteIds: ["scholar-roots"],
    requirement: { kind: "qualifying_documentation", count: 2 },
  }),
  skill({
    id: "scholar-side",
    branch: "scholar",
    type: "minor",
    tier: "intermediate",
    title: "Deep Dive",
    description: "Investigate a problem and leave the findings behind.",
    prerequisiteIds: ["scholar-foundation"],
    requirement: { kind: "qualifying_documentation", count: 3 },
  }),
  skill({
    id: "scholar-advanced",
    branch: "scholar",
    type: "notable",
    tier: "advanced",
    title: "Reference",
    description: "Write the document others will point at for years.",
    prerequisiteIds: ["scholar-foundation", "bridge-debugger-scholar"],
    requirement: { kind: "qualifying_documentation", count: 4 },
  }),
  skill({
    id: "scholar-capstone",
    branch: "scholar",
    type: "keystone",
    tier: "mastery",
    title: "Living Knowledge",
    description: "A body of documentation that keeps itself current.",
    prerequisiteIds: ["scholar-advanced"],
  }),

  /* --- Collaborator ---------------------------------------------------- */
  skill({
    id: "collaborator-roots",
    branch: "collaborator",
    type: "minor",
    tier: "roots",
    title: "First Review",
    description: "Read someone else's work carefully enough to sign off on it.",
    prerequisiteIds: ["origin"],
    requirement: { kind: "completed_reviews", count: 1 },
  }),
  skill({
    id: "collaborator-foundation",
    branch: "collaborator",
    type: "notable",
    tier: "foundation",
    title: "Trusted Reviewer",
    description: "Review often enough that people ask for you specifically.",
    prerequisiteIds: ["collaborator-roots"],
    requirement: { kind: "completed_reviews", count: 2 },
  }),
  skill({
    id: "collaborator-side",
    branch: "collaborator",
    type: "minor",
    tier: "intermediate",
    title: "Cross-Branch Review",
    description: "Review across branches you do not work in yourself.",
    prerequisiteIds: ["collaborator-foundation"],
    requirement: { kind: "completed_reviews", count: 3 },
  }),
  skill({
    id: "collaborator-advanced",
    branch: "collaborator",
    type: "notable",
    tier: "advanced",
    title: "Steward",
    description: "Keep other people's work moving without owning it.",
    prerequisiteIds: ["collaborator-foundation", "bridge-scholar-collaborator"],
    requirement: { kind: "completed_reviews", count: 4 },
  }),
  skill({
    id: "collaborator-capstone",
    branch: "collaborator",
    type: "keystone",
    tier: "mastery",
    title: "Keeper of the Merge",
    description: "Other projects' work clears because of your judgement.",
    prerequisiteIds: ["collaborator-advanced"],
  }),

  /* --- Maintainer ------------------------------------------------------ */
  skill({
    id: "maintainer-roots",
    branch: "maintainer",
    type: "minor",
    tier: "roots",
    title: "First Release",
    description: "Put a version into people's hands.",
    prerequisiteIds: ["origin"],
    requirement: { kind: "published_releases", count: 1 },
  }),
  skill({
    id: "maintainer-foundation",
    branch: "maintainer",
    type: "notable",
    tier: "foundation",
    title: "Sustained",
    description: "Keep a project releasable over time.",
    prerequisiteIds: ["maintainer-roots"],
    requirement: { kind: "published_releases", count: 2 },
  }),
  skill({
    id: "maintainer-side",
    branch: "maintainer",
    type: "minor",
    tier: "intermediate",
    title: "Triage",
    description: "Close other people's issues so the queue means something.",
    prerequisiteIds: ["maintainer-foundation"],
    requirement: { kind: "linked_issue_closures", count: 3 },
  }),
  skill({
    id: "maintainer-advanced",
    branch: "maintainer",
    type: "notable",
    tier: "advanced",
    title: "Release Manager",
    description: "Own the version a project is known by.",
    prerequisiteIds: ["maintainer-foundation", "bridge-collaborator-maintainer"],
    requirement: { kind: "published_releases", count: 3 },
  }),
  skill({
    id: "maintainer-capstone",
    branch: "maintainer",
    type: "keystone",
    tier: "mastery",
    title: "Steward of the Long Term",
    description: "Keep a project healthy across years of its contributors.",
    prerequisiteIds: ["maintainer-advanced"],
  }),

  /* --- Architect ------------------------------------------------------- */
  /*
   * §14 gives Architect "verified refactoring, modularization, system design
   * work" and adds that it "should be conservative because the underlying
   * evidence is harder to infer reliably". TASKS 5.9's `UNAWARDED_ATTRIBUTES`
   * asserts Architect stays unawarded: nothing ingested exposes file paths, diffs
   * or commit lists.
   *
   * These nodes therefore require Architect attribute units that no rule currently
   * grants. They stay in the catalog because §14 defines the branch, and TASKS
   * 6.4 will report them as zero-progress rather than locked — a node needing
   * something unobtainable is an evidence gap to surface, not a dead end to hide.
   */
  skill({
    id: "architect-roots",
    branch: "architect",
    type: "minor",
    tier: "roots",
    title: "First Restructure",
    description: "Change the shape of a system without changing what it does.",
    prerequisiteIds: ["origin"],
    requirement: { kind: "attribute_units", attribute: "architect", count: 1 },
  }),
  skill({
    id: "architect-foundation",
    branch: "architect",
    type: "notable",
    tier: "foundation",
    title: "Modular",
    description: "Break a system along seams that make sense.",
    prerequisiteIds: ["architect-roots"],
    requirement: { kind: "attribute_units", attribute: "architect", count: 2 },
  }),
  skill({
    id: "architect-side",
    branch: "architect",
    type: "minor",
    tier: "intermediate",
    title: "Boundaries",
    description: "Give a subsystem an interface the rest of the code respects.",
    prerequisiteIds: ["architect-foundation"],
    requirement: { kind: "attribute_units", attribute: "architect", count: 3 },
  }),
  skill({
    id: "architect-advanced",
    branch: "architect",
    type: "notable",
    tier: "advanced",
    title: "Structure That Lasts",
    description: "A shape the project can keep building on.",
    prerequisiteIds: ["architect-foundation", "bridge-maintainer-architect"],
    requirement: { kind: "attribute_units", attribute: "architect", count: 5 },
  }),
  skill({
    id: "architect-capstone",
    branch: "architect",
    type: "keystone",
    tier: "mastery",
    title: "System Design",
    description: "Decisions that outlive everyone who made them.",
    prerequisiteIds: ["architect-advanced"],
    requirement: { kind: "attribute_units", attribute: "architect", count: 10 },
  }),

  /* --- Bridges --------------------------------------------------------- */
  /*
   * A bridge spans two branches, so its evidence has to as well. A completed
   * review is the one measurement that legitimately crosses branches — you review
   * code you did not write, which is exactly what a bridge represents.
   */
  skill({
    id: "bridge-builder-debugger",
    branch: "builder",
    type: "minor",
    tier: "foundation",
    title: "Ship the Fix",
    description: "Land the repair you diagnosed, rather than only reporting it.",
    prerequisiteIds: ["builder-foundation", "debugger-foundation"],
    requirement: { kind: "completed_reviews", count: 2 },
  }),
  skill({
    id: "bridge-debugger-scholar",
    branch: "debugger",
    type: "minor",
    tier: "foundation",
    title: "Write It Down",
    description: "Leave a record of why the failure happened.",
    prerequisiteIds: ["debugger-foundation", "scholar-foundation"],
    requirement: { kind: "qualifying_documentation", count: 2 },
  }),
  skill({
    id: "bridge-scholar-collaborator",
    branch: "scholar",
    type: "minor",
    tier: "foundation",
    title: "Teach Through Review",
    description: "Explain an improvement where someone is already reading.",
    prerequisiteIds: ["scholar-foundation", "collaborator-foundation"],
    requirement: { kind: "completed_reviews", count: 2 },
  }),
  skill({
    id: "bridge-collaborator-maintainer",
    branch: "collaborator",
    type: "minor",
    tier: "foundation",
    title: "Triage Together",
    description: "Help keep someone else's project releasable.",
    prerequisiteIds: ["collaborator-foundation", "maintainer-foundation"],
    requirement: { kind: "linked_issue_closures", count: 2 },
  }),
  skill({
    id: "bridge-maintainer-architect",
    branch: "maintainer",
    type: "minor",
    tier: "foundation",
    title: "Shape for the Long Term",
    description: "Restructure a system you are also responsible for shipping.",
    prerequisiteIds: ["maintainer-foundation", "architect-foundation"],
    requirement: { kind: "published_releases", count: 2 },
  }),
];