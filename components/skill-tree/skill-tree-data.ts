/**
 * RootRealm — skill tree content model and MOCK graph (TASKS §2.3–2.6).
 *
 * This module owns the 36-node prototype tree the screen renders. It is a
 * CONTENT module: types, coordinates and copy. Nothing here decides whether a
 * node may be learned — eligibility is derived in `skill-tree-logic.ts` from
 * `prerequisiteIds` alone, because DATA_CONTRACT §16 is explicit that
 * `visualX`/`visualY` are presentation metadata and must never determine
 * eligibility. Nothing here is fetched or persisted: like `profile-data.ts`,
 * every value is illustrative mock data disconnected from any backend
 * (TASKS §2.3 "Use mock nodes").
 *
 * Graph shape — 36 nodes: 1 Origin (core, always learned), 6 branches × 5
 * nodes (roots → foundation → side path → advanced → mastery capstone; the
 * capstone is the branch's single keystone), and 5 bridges linking adjacent
 * branches. Prerequisites are OR-qualified — a bridge is reachable from
 * EITHER neighbouring foundation, and each branch's advanced node accepts a
 * bridge as an alternative route, which is what makes the cheapest-path
 * preview meaningful.
 *
 * Coordinates are a bottom-up fan: the Origin sits low and centre, tiers rise
 * in equal rows (Roots → Mastery), branch columns spread symmetrically outward
 * with tier. Hand-tuned literals rather than a formula, so the layout is
 * reviewable line by line.
 */

import type { AttributeKey } from "@/lib/attributes";

/** What kind of node this is. Drives size, cost and reward defaults. */
export type SkillNodeType = "core" | "keystone" | "notable" | "minor";

/**
 * The five tiers of DESIGN_SYSTEM §16 (Roots → Foundation → Intermediate →
 * Advanced → Mastery / Canopy), bottom-up as the reference draws them.
 */
export type SkillTier = "roots" | "foundation" | "intermediate" | "advanced" | "mastery";

/**
 * Per-user node state (TASKS §2.3; DESIGN_SYSTEM §17). Derived, never stored:
 *
 * - `locked` — no OR-prerequisite route is satisfied (§17 "Dimmed")
 * - `in-progress` — prerequisites satisfied but evidence short of
 *   `requiredProgress` (§17 "Outlined or partially illuminated")
 * - `eligible` — prerequisites satisfied and evidence complete, not learned
 *   (§17 "Visually indicates that requirements are satisfied")
 * - `learned` — in the learned set (§17 "Restrained luminous treatment")
 *
 * `selected` is not listed: selection is a view concern owned by the screen.
 */
export type SkillNodeStatus = "locked" | "in-progress" | "eligible" | "learned";

/** One node of the tree. Mirrors DATA_CONTRACT §16 where a field exists. */
export type SkillNode = {
  /** Stable identifier; prerequisites reference these. */
  id: string;
  /** Branch (contract `category`), or `null` for the Origin. */
  branch: AttributeKey | null;
  type: SkillNodeType;
  tier: SkillTier;
  title: string;
  description: string;
  /** One-line flavour text for the detail panel. Pure copy. */
  flavor: string;
  /** Presentation only (DATA_CONTRACT §16): never used for eligibility. */
  visualX: number;
  /** Presentation only (DATA_CONTRACT §16): never used for eligibility. */
  visualY: number;
  /** Skill points this node costs to learn (0 for the Origin). */
  cost: number;
  /** OR-prerequisites: ANY one learned satisfies the requirement. */
  prerequisiteIds: readonly string[];
  /** Illustrative benefits shown in the detail panel. Mock copy. */
  effects: readonly string[];
  /** Glyph key resolved by `skill-tree-glyphs.tsx` (contract `icon`). */
  icon: string;
  /** Evidence the real system would require (contract `requiredProgress`). */
  requiredProgress: number;
  /** Static mock evidence snapshot; equals `requiredProgress` unless listed. */
  progress: number;
  /** Evidence line for the detail panel (TASKS §2.5). */
  evidenceHint: string;
  /** Mock source URL for the evidence shown in the prototype. */
  evidenceHref: string;
  /** Rewards displayed by the detail panel (contract `xpReward`/`codeCoinReward`). */
  xpReward: number;
  codeCoinReward: number;
};

/** Bottom-up tier order, for list sorting and tier markers (DESIGN_SYSTEM §16). */
export const TIER_ORDER: readonly SkillTier[] = [
  "roots",
  "foundation",
  "intermediate",
  "advanced",
  "mastery",
];

/** Tier display names, exactly as `references/approved-ui/skill-tree.png` labels them. */
export const TIER_LABEL: Record<SkillTier, string> = {
  roots: "Roots",
  foundation: "Foundation",
  intermediate: "Intermediate",
  advanced: "Advanced",
  mastery: "Mastery",
};

/**
 * The six branches, left to right across the canvas. Same order as
 * `ATTRIBUTE_LABEL` (builder → architect), so the branch rail, the list
 * fallback and the canvas fan all iterate one shared sequence.
 */
export const BRANCH_ORDER: readonly AttributeKey[] = [
  "builder",
  "debugger",
  "scholar",
  "collaborator",
  "maintainer",
  "architect",
];

/* --- Type-keyed defaults ---------------------------------------------------
   `node()` applies these so each literal only carries what makes it unique —
   the 36 literals stay a readable table. */

const COST: Record<SkillNodeType, number> = { core: 0, keystone: 3, notable: 2, minor: 1 };
const XP_REWARD: Record<SkillNodeType, number> = { core: 0, keystone: 150, notable: 80, minor: 40 };
const COIN_REWARD: Record<SkillNodeType, number> = { core: 0, keystone: 8, notable: 4, minor: 2 };
const REQUIRED_PROGRESS: Record<SkillNodeType, number> = {
  core: 1,
  keystone: 3,
  notable: 2,
  minor: 1,
};

/** Evidence copy per node kind — the detail panel's "Evidence" line (TASKS §2.5). */
const EVIDENCE_HINT: Record<SkillNodeType, string> = {
  core: "Granted when your GitHub account is connected.",
  minor: "Verified from your recent public commits.",
  notable: "Verified from merged pull requests on GitHub.",
  keystone: "Verified from release activity across your repositories.",
};

/** Fields a literal supplies; the rest are derived from `type`. */
type NodeInput = Omit<
  SkillNode,
  | "cost"
  | "xpReward"
  | "codeCoinReward"
  | "requiredProgress"
  | "progress"
  | "evidenceHint"
  | "evidenceHref"
> & {
  /** Overrides the evidence snapshot for nodes shown as in-progress. */
  progress?: number;
};

/** Build one node, filling type-keyed defaults. */
function node(input: NodeInput): SkillNode {
  const requiredProgress = REQUIRED_PROGRESS[input.type];
  return {
    ...input,
    cost: COST[input.type],
    xpReward: XP_REWARD[input.type],
    codeCoinReward: COIN_REWARD[input.type],
    requiredProgress,
    progress: input.progress ?? requiredProgress,
    evidenceHint: EVIDENCE_HINT[input.type],
    evidenceHref: "https://github.com",
  };
}

/** Any node of the tree, with rewards applied. */
export type SkillTreeNode = SkillNode;

/* --------------------------------------------------------------------------
   The graph. Order: Origin, branches left→right (BRANCH_ORDER), bridges.
   -------------------------------------------------------------------------- */

export const SKILL_NODES: readonly SkillNode[] = [
  node({
    id: "origin",
    branch: null,
    type: "core",
    tier: "roots",
    title: "Origin",
    description: "The trunk every path grows from — your GitHub identity, verified and connected.",
    flavor: "Everything you ship starts here.",
    visualX: 0,
    visualY: 1290,
    prerequisiteIds: [],
    effects: ["Unlocks the six branches", "Roots your profile's progression"],
    icon: "origin",
  }),
  /* --- Builder (gold) ------------------------------------------------- */
  node({
    id: "builder-roots",
    branch: "builder",
    type: "minor",
    tier: "roots",
    title: "First Merge",
    description: "Ship your first change end to end — branch, commit, review, merge.",
    flavor: "Every cathedral starts with one stone.",
    visualX: -375,
    visualY: 1160,
    prerequisiteIds: ["origin"],
    effects: ["Shows a shipped-change mark on your profile", "Feeds the Builder attribute"],
    icon: "hammer",
  }),
  node({
    id: "builder-foundation",
    branch: "builder",
    type: "notable",
    tier: "foundation",
    title: "Feature Craft",
    description: "Turn a well-scoped idea into working, reviewed software.",
    flavor: "Scope is the feature.",
    visualX: -575,
    visualY: 1000,
    prerequisiteIds: ["builder-roots"],
    effects: ["Highlights your most-shipped project", "Feeds the Builder attribute"],
    icon: "anvil",
  }),
  node({
    id: "builder-side",
    branch: "builder",
    type: "minor",
    tier: "intermediate",
    title: "Rapid Prototype",
    description: "Sketch in code before the spec is final, then throw it away without guilt.",
    flavor: "First drafts are allowed to be ugly.",
    visualX: -725,
    visualY: 830,
    /* Mock evidence still pending — the one node demoing in-progress (§17). */
    progress: 0,
    prerequisiteIds: ["builder-foundation"],
    effects: ["Badges exploratory repositories", "Feeds the Builder attribute"],
    icon: "flask",
  }),
  node({
    id: "builder-advanced",
    branch: "builder",
    type: "notable",
    tier: "advanced",
    title: "Ship Streak",
    description: "Keep a rhythm of small, releasable changes instead of heroic releases.",
    flavor: "Momentum beats marathons.",
    visualX: -875,
    visualY: 480,
    /* OR: own foundation, or cross in over the shared Debugger bridge. */
    prerequisiteIds: ["builder-foundation", "bridge-builder-debugger"],
    effects: ["Surfaces your release cadence", "Feeds the Builder attribute"],
    icon: "rocket",
  }),
  node({
    id: "builder-capstone",
    branch: "builder",
    type: "keystone",
    tier: "mastery",
    title: "Product Sense",
    description: "Build the thing people actually needed, not the thing they asked for.",
    flavor: "The best code solves the right problem.",
    visualX: -1000,
    visualY: 240,
    prerequisiteIds: ["builder-advanced"],
    effects: ["Keystone glow on the Builder branch", "Grand reveal on unlock"],
    icon: "star",
  }),

  /* --- Debugger (orange) ----------------------------------------------- */
  node({
    id: "debugger-roots",
    branch: "debugger",
    type: "minor",
    tier: "roots",
    title: "Breakpoint",
    description: "Stop the program at the right line and look around without fear.",
    flavor: "Slow is smooth.",
    visualX: -225,
    visualY: 1160,
    prerequisiteIds: ["origin"],
    effects: ["Marks issues you traced to source", "Feeds the Debugger attribute"],
    icon: "bug",
  }),
  node({
    id: "debugger-foundation",
    branch: "debugger",
    type: "notable",
    tier: "foundation",
    title: "Root Cause",
    description: "Find why it broke, not only where the exception happened to land.",
    flavor: "Symptoms lie; causes don't.",
    visualX: -345,
    visualY: 1000,
    prerequisiteIds: ["debugger-roots"],
    effects: ["Links root-cause write-ups to your profile", "Feeds the Debugger attribute"],
    icon: "magnifier",
  }),
  node({
    id: "debugger-side",
    branch: "debugger",
    type: "minor",
    tier: "intermediate",
    title: "Log Whisperer",
    description: "Read the story your logs are telling — timestamps, gaps and all.",
    flavor: "The trace is trying to help.",
    visualX: -435,
    visualY: 830,
    prerequisiteIds: ["debugger-foundation"],
    effects: ["Highlights debugging sessions in your history", "Feeds the Debugger attribute"],
    icon: "lines",
  }),
  node({
    id: "debugger-advanced",
    branch: "debugger",
    type: "notable",
    tier: "advanced",
    title: "Bisect Instinct",
    description: "Narrow any failure down to the single change that caused it.",
    flavor: "Halve the search, every time.",
    visualX: -525,
    visualY: 480,
    prerequisiteIds: ["debugger-foundation", "bridge-builder-debugger"],
    effects: ["Shows your median time-to-fix", "Feeds the Debugger attribute"],
    icon: "git",
  }),
  node({
    id: "debugger-capstone",
    branch: "debugger",
    type: "keystone",
    tier: "mastery",
    title: "Heisenbug Slayer",
    description: "Catch the bug that vanishes the moment anyone watches it.",
    flavor: "Observe anyway.",
    visualX: -600,
    visualY: 240,
    prerequisiteIds: ["debugger-advanced"],
    effects: ["Keystone glow on the Debugger branch", "Grand reveal on unlock"],
    icon: "star",
  }),
  /* --- Scholar (cyan) --------------------------------------------------- */
  node({
    id: "scholar-roots",
    branch: "scholar",
    type: "minor",
    tier: "roots",
    title: "Curious Mind",
    description: "Read the docs, the source and the changelog before writing a line.",
    flavor: "Questions are cheaper than bugs.",
    visualX: -75,
    visualY: 1160,
    prerequisiteIds: ["origin"],
    effects: ["Surfaces what you have been reading", "Feeds the Scholar attribute"],
    icon: "book",
  }),
  node({
    id: "scholar-foundation",
    branch: "scholar",
    type: "notable",
    tier: "foundation",
    title: "Docs Diver",
    description: "Follow the documentation down to the source until you understand the why.",
    flavor: "The manual is a map, not the territory.",
    visualX: -115,
    visualY: 1000,
    prerequisiteIds: ["scholar-roots"],
    effects: ["Highlights notes linked from your commits", "Feeds the Scholar attribute"],
    icon: "scroll",
  }),
  node({
    id: "scholar-side",
    branch: "scholar",
    type: "minor",
    tier: "intermediate",
    title: "Note Keeper",
    description: "Write down what you learned while it is still fresh, in a place you will find again.",
    flavor: "Future you is a stranger.",
    visualX: -145,
    visualY: 830,
    prerequisiteIds: ["scholar-foundation"],
    effects: ["Shows a public learning log", "Feeds the Scholar attribute"],
    icon: "quill",
  }),
  node({
    id: "scholar-advanced",
    branch: "scholar",
    type: "notable",
    tier: "advanced",
    title: "Pattern Language",
    description: "Name the shapes you keep seeing, so a team can talk about them without diagrams.",
    flavor: "A shared word is a shared mind.",
    visualX: -175,
    visualY: 480,
    prerequisiteIds: ["scholar-foundation", "bridge-debugger-scholar"],
    effects: ["Tags recognised patterns in your write-ups", "Feeds the Scholar attribute"],
    icon: "shapes",
  }),
  node({
    id: "scholar-capstone",
    branch: "scholar",
    type: "keystone",
    tier: "mastery",
    title: "Deep Generalist",
    description: "Connect ideas across domains and bring the insight back to your own work.",
    flavor: "Range is a moat.",
    visualX: -200,
    visualY: 240,
    prerequisiteIds: ["scholar-advanced"],
    effects: ["Keystone glow on the Scholar branch", "Grand reveal on unlock"],
    icon: "star",
  }),

  /* --- Collaborator (blue) ---------------------------------------------- */
  node({
    id: "collaborator-roots",
    branch: "collaborator",
    type: "minor",
    tier: "roots",
    title: "Open Ear",
    description: "Read the whole review before answering the first line of it.",
    flavor: "Feedback is a gift with packaging.",
    visualX: 75,
    visualY: 1160,
    prerequisiteIds: ["origin"],
    effects: ["Counts reviews you responded to", "Feeds the Collaborator attribute"],
    icon: "ear",
  }),
  node({
    id: "collaborator-foundation",
    branch: "collaborator",
    type: "notable",
    tier: "foundation",
    title: "Pair Flow",
    description: "Think out loud with someone else until the stuck thing unsticks.",
    flavor: "Two keyboards, one thought.",
    visualX: 115,
    visualY: 1000,
    prerequisiteIds: ["collaborator-roots"],
    effects: ["Marks pairing sessions in your history", "Feeds the Collaborator attribute"],
    icon: "pair",
  }),
  node({
    id: "collaborator-side",
    branch: "collaborator",
    type: "minor",
    tier: "intermediate",
    title: "Issue Wrangler",
    description: "Turn a vague report into clear reproduction steps anyone can act on.",
    flavor: "Clarity is kindness.",
    visualX: 145,
    visualY: 830,
    prerequisiteIds: ["collaborator-foundation"],
    effects: ["Highlights issues you clarified", "Feeds the Collaborator attribute"],
    icon: "inbox",
  }),
  node({
    id: "collaborator-advanced",
    branch: "collaborator",
    type: "notable",
    tier: "advanced",
    title: "Merge Diplomat",
    description: "Land changes without breaking trust, even when the debate ran hot.",
    flavor: "Merge the change, keep the team.",
    visualX: 175,
    visualY: 480,
    prerequisiteIds: ["collaborator-foundation", "bridge-scholar-collaborator"],
    effects: ["Shows conflict resolutions you mediated", "Feeds the Collaborator attribute"],
    icon: "handshake",
  }),
  node({
    id: "collaborator-capstone",
    branch: "collaborator",
    type: "keystone",
    tier: "mastery",
    title: "Force Multiplier",
    description: "Make everyone around you faster — through review, mentorship and clarity.",
    flavor: "A rising branch lifts the forest.",
    visualX: 200,
    visualY: 240,
    prerequisiteIds: ["collaborator-advanced"],
    effects: ["Keystone glow on the Collaborator branch", "Grand reveal on unlock"],
    icon: "star",
  }),
  /* --- Maintainer (red) -------------------------------------------------- */
  node({
    id: "maintainer-roots",
    branch: "maintainer",
    type: "minor",
    tier: "roots",
    title: "Clean Sweep",
    description: "Sweep the dust out of the repo — dead code, stale branches, stale docs.",
    flavor: "A tidy tree grows straight.",
    visualX: 225,
    visualY: 1160,
    prerequisiteIds: ["origin"],
    effects: ["Counts housekeeping contributions", "Feeds the Maintainer attribute"],
    icon: "broom",
  }),
  node({
    id: "maintainer-foundation",
    branch: "maintainer",
    type: "notable",
    tier: "foundation",
    title: "Release Ritual",
    description: "Ship versions on a dependable cadence the community can plan around.",
    flavor: "Predictability is a feature.",
    visualX: 345,
    visualY: 1000,
    prerequisiteIds: ["maintainer-roots"],
    effects: ["Shows your release train on the profile", "Feeds the Maintainer attribute"],
    icon: "tag",
  }),
  node({
    id: "maintainer-side",
    branch: "maintainer",
    type: "minor",
    tier: "intermediate",
    title: "Dependency Watch",
    description: "Keep the supply chain healthy — reviewed, pinned and updated on purpose.",
    flavor: "Nothing upstream stays still.",
    visualX: 435,
    visualY: 830,
    prerequisiteIds: ["maintainer-foundation"],
    effects: ["Flags dependency updates you handled", "Feeds the Maintainer attribute"],
    icon: "shield",
  }),
  node({
    id: "maintainer-advanced",
    branch: "maintainer",
    type: "notable",
    tier: "advanced",
    title: "Triage Command",
    description: "Sort the noise from the fires, and give every issue a next step.",
    flavor: "Order is a kindness.",
    visualX: 525,
    visualY: 480,
    prerequisiteIds: ["maintainer-foundation", "bridge-collaborator-maintainer"],
    effects: ["Shows triage throughput per repository", "Feeds the Maintainer attribute"],
    icon: "compass",
  }),
  node({
    id: "maintainer-capstone",
    branch: "maintainer",
    type: "keystone",
    tier: "mastery",
    title: "Project Steward",
    description: "Carry a codebase and its contributors safely through the long run.",
    flavor: "Custody, not ownership.",
    visualX: 600,
    visualY: 240,
    prerequisiteIds: ["maintainer-advanced"],
    effects: ["Keystone glow on the Maintainer branch", "Grand reveal on unlock"],
    icon: "star",
  }),
  /* --- Architect (bronze) ------------------------------------------------ */
  node({
    id: "architect-roots",
    branch: "architect",
    type: "minor",
    tier: "roots",
    title: "Boundary Line",
    description: "Know where one module ends and the next one begins — and write it down.",
    flavor: "Edges make shapes legible.",
    visualX: 375,
    visualY: 1160,
    prerequisiteIds: ["origin"],
    effects: ["Maps module boundaries in your repos", "Feeds the Architect attribute"],
    icon: "blueprint",
  }),
  node({
    id: "architect-foundation",
    branch: "architect",
    type: "notable",
    tier: "foundation",
    title: "Interface First",
    description: "Design the contract before the implementation gets a vote.",
    flavor: "Promises before plumbing.",
    visualX: 575,
    visualY: 1000,
    prerequisiteIds: ["architect-roots"],
    effects: ["Lists the interfaces you maintain", "Feeds the Architect attribute"],
    icon: "layers",
  }),
  node({
    id: "architect-side",
    branch: "architect",
    type: "minor",
    tier: "intermediate",
    title: "Data Flow",
    description: "Trace how state moves through the system — and where it quietly leaks.",
    flavor: "Follow the data, not the hype.",
    visualX: 725,
    visualY: 830,
    prerequisiteIds: ["architect-foundation"],
    effects: ["Publishes a data-flow sketch per project", "Feeds the Architect attribute"],
    icon: "flow",
  }),
  node({
    id: "architect-advanced",
    branch: "architect",
    type: "notable",
    tier: "advanced",
    title: "Scale Lens",
    description: "Plan for the load that has not arrived yet, without over-building for it.",
    flavor: "Build for today; leave room for tomorrow.",
    visualX: 875,
    visualY: 480,
    prerequisiteIds: ["architect-foundation", "bridge-maintainer-architect"],
    effects: ["Shows capacity notes on your projects", "Feeds the Architect attribute"],
    icon: "grid",
  }),
  node({
    id: "architect-capstone",
    branch: "architect",
    type: "keystone",
    tier: "mastery",
    title: "Systems Vision",
    description: "See the shape of the whole before any of its parts has been written.",
    flavor: "Draw the map before the road.",
    visualX: 1000,
    visualY: 240,
    prerequisiteIds: ["architect-advanced"],
    effects: ["Keystone glow on the Architect branch", "Grand reveal on unlock"],
    icon: "star",
  }),




  /* --- Bridges — cross-branch joints on the foundation row.
     Each is reachable from EITHER neighbouring foundation (OR), and each
     neighbouring advanced node accepts it as an alternative route, so the
     cheapest-path solver has real choices to weigh. ------------------------ */
  node({
    id: "bridge-builder-debugger",
    branch: "builder",
    type: "minor",
    tier: "foundation",
    title: "Instrumented Build",
    description: "Ship with the observability already wired in, so failures explain themselves.",
    flavor: "Hope is not a strategy.",
    visualX: -460,
    visualY: 1000,
    prerequisiteIds: ["builder-foundation", "debugger-foundation"],
    effects: ["Opens the Builder ↔ Debugger crossing", "Feeds Builder and Debugger"],
    icon: "link",
  }),
  node({
    id: "bridge-debugger-scholar",
    branch: "debugger",
    type: "minor",
    tier: "foundation",
    title: "Root Cause Notes",
    description: "Fix the bug, then write down why it was possible — so it stays fixed.",
    flavor: "A bug fixed twice was documented zero times.",
    visualX: -230,
    visualY: 1000,
    prerequisiteIds: ["debugger-foundation", "scholar-foundation"],
    effects: ["Opens the Debugger ↔ Scholar crossing", "Feeds Debugger and Scholar"],
    icon: "link",
  }),
  node({
    id: "bridge-scholar-collaborator",
    branch: "scholar",
    type: "minor",
    tier: "foundation",
    title: "Teaching Loop",
    description: "Explain what you learned well enough that someone else can apply it.",
    flavor: "Learned twice when taught once.",
    visualX: 0,
    visualY: 1000,
    prerequisiteIds: ["scholar-foundation", "collaborator-foundation"],
    effects: ["Opens the Scholar ↔ Collaborator crossing", "Feeds Scholar and Collaborator"],
    icon: "link",
  }),
  node({
    id: "bridge-collaborator-maintainer",
    branch: "collaborator",
    type: "minor",
    tier: "foundation",
    title: "Review to Release",
    description: "Carry changes from first review all the way to a tagged release.",
    flavor: "Merged is not shipped.",
    visualX: 230,
    visualY: 1000,
    prerequisiteIds: ["collaborator-foundation", "maintainer-foundation"],
    effects: ["Opens the Collaborator ↔ Maintainer crossing", "Feeds Collaborator and Maintainer"],
    icon: "link",
  }),
  node({
    id: "bridge-maintainer-architect",
    branch: "maintainer",
    type: "minor",
    tier: "foundation",
    title: "Migration Path",
    description: "Evolve a shipped system without stranding the people who depend on it.",
    flavor: "Change without wreckage.",
    visualX: 460,
    visualY: 1000,
    prerequisiteIds: ["maintainer-foundation", "architect-foundation"],
    effects: ["Opens the Maintainer ↔ Architect crossing", "Feeds Maintainer and Architect"],
    icon: "link",
  }),

];

/**
 * Id → node lookup, built once from the array (the array stays canonical).
 * UI code reaches for this instead of scanning all 36 nodes per render.
 */
export const SKILL_NODE_BY_ID: ReadonlyMap<string, SkillNode> = new Map(
  SKILL_NODES.map((skillNode) => [skillNode.id, skillNode]),
);

/**
 * Skill points the prototype hands out (TASKS §2.4 "Points left").
 *
 * A full branch costs 9 (roots 1 → foundation 2 → side path 1 → advanced 2 →
 * capstone 3), so 22 buys two complete branches plus a crossing — but never a
 * third. The budget is what makes spend order a decision, not a formality.
 */
export const SKILL_POINT_BUDGET = 22;

/** Learned on first render. The Origin is free and always learned (§17). */
export const INITIAL_LEARNED_IDS: readonly string[] = ["origin"];


