/**
 * RootRealm — skill node presentation data (TASKS 6.6).
 *
 * Cosmetic metadata for the tree, kept apart from the domain catalog
 * (`lib/skills/catalog.ts`). TASKS 6.1 removed these fields from
 * `SkillDefinition` because they are not progression: `visualX`/`visualY` are
 * canvas coordinates, `flavor` and `effects` are copy, and `xpReward` /
 * `codeCoinReward` are display values for rewards the §29 CodeCoins phase does
 * not yet define.
 *
 * Moving a node's position or copy here cannot change what it requires.
 */

export interface SkillNodePresentation {
  /** One-line flavour text for the detail panel. */
  readonly flavor: string;
  /** Display copy for the rewards list. */
  readonly effects: readonly string[];
  /** Canvas x coordinate. */
  readonly visualX: number;
  /** Canvas y coordinate. */
  readonly visualY: number;
  /** Display value for the XP reward. */
  readonly xpReward: number;
  /** Display value for the CodeCoin reward. */
  readonly codeCoinReward: number;
  /** Glyph key resolved by `skill-tree-glyphs.tsx`. */
  readonly icon: string;
}

/**
 * Presentation data for every node, keyed by skill id.
 *
 * A `Record` so a node added to the domain catalog without presentation data
 * is a compile error rather than a silently unplaced node.
 */
export const SKILL_NODE_PRESENTATION: Readonly<
  Record<string, SkillNodePresentation>
> = {
  origin: {
    flavor: "The root every branch grows from.",
    effects: ["Unlocks the six branches", "Roots your profile's progression"],
    visualX: 0,
    visualY: 1290,
    xpReward: 0,
    codeCoinReward: 0,
    icon: "origin",
  },
  "builder-roots": {
    flavor: "Ship your first change end to end.",
    effects: ["Shows a shipped-change mark on your profile", "Feeds the Builder attribute"],
    visualX: -375,
    visualY: 1160,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "hammer",
  },
  "builder-foundation": {
    flavor: "Merge repeatedly enough that shipping becomes routine.",
    effects: ["Highlights your most-shipped project", "Feeds the Builder attribute"],
    visualX: -575,
    visualY: 1000,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "anvil",
  },
  "builder-side": {
    flavor: "Keep a branch alive across days and still land it.",
    effects: ["Badges exploratory repositories", "Feeds the Builder attribute"],
    visualX: -725,
    visualY: 830,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "flask",
  },
  "builder-advanced": {
    flavor: "Land work substantial enough to change what the project can do.",
    effects: ["Surfaces your release cadence", "Feeds the Builder attribute"],
    visualX: -875,
    visualY: 480,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "rocket",
  },
  "builder-capstone": {
    flavor: "A body of merged work that others build on.",
    effects: ["Keystone glow on the Builder branch", "Grand reveal on unlock"],
    visualX: -1000,
    visualY: 240,
    xpReward: 150,
    codeCoinReward: 8,
    icon: "star",
  },
  "debugger-roots": {
    flavor: "Close your first reported bug, with the fix visible to everyone.",
    effects: ["Shows a bug-fix mark on your profile", "Feeds the Debugger attribute"],
    visualX: -225,
    visualY: 1160,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "bug",
  },
  "debugger-foundation": {
    flavor: "Close enough reported issues that the pattern is unmistakable.",
    effects: ["Highlights your most-diagnosed issue", "Feeds the Debugger attribute"],
    visualX: -345,
    visualY: 1000,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "magnifier",
  },
  "debugger-side": {
    flavor: "Close a bug and lock it behind a test that fails without your fix.",
    effects: ["Badges regression tests you wrote", "Feeds the Debugger attribute"],
    visualX: -435,
    visualY: 830,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "lines",
  },
  "debugger-advanced": {
    flavor: "Harden a project until it stops breaking the same ways.",
    effects: ["Surfaces your reliability work", "Feeds the Debugger attribute"],
    visualX: -525,
    visualY: 480,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "git",
  },
  "debugger-capstone": {
    flavor: "A tested, verified safety net a maintainer relies on.",
    effects: ["Keystone glow on the Debugger branch", "Grand reveal on unlock"],
    visualX: -600,
    visualY: 240,
    xpReward: 150,
    codeCoinReward: 8,
    icon: "star",
  },
  "scholar-roots": {
    flavor: "Write something down so the next person does not have to rediscover it.",
    effects: ["Shows a documentation mark on your profile", "Feeds the Scholar attribute"],
    visualX: -75,
    visualY: 1160,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "book",
  },
  "scholar-foundation": {
    flavor: "Document enough that the project can be understood without you.",
    effects: ["Highlights your most-read document", "Feeds the Scholar attribute"],
    visualX: -115,
    visualY: 1000,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "scroll",
  },
  "scholar-side": {
    flavor: "Investigate a problem and leave the findings behind.",
    effects: ["Badges deep-dive research", "Feeds the Scholar attribute"],
    visualX: -145,
    visualY: 830,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "quill",
  },
  "scholar-advanced": {
    flavor: "Write the document others will point at for years.",
    effects: ["Surfaces your reference work", "Feeds the Scholar attribute"],
    visualX: -175,
    visualY: 480,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "shapes",
  },
  "scholar-capstone": {
    flavor: "A body of documentation that keeps itself current.",
    effects: ["Keystone glow on the Scholar branch", "Grand reveal on unlock"],
    visualX: -200,
    visualY: 240,
    xpReward: 150,
    codeCoinReward: 8,
    icon: "star",
  },
  "collaborator-roots": {
    flavor: "Read someone else's work carefully enough to sign off on it.",
    effects: ["Shows a review mark on your profile", "Feeds the Collaborator attribute"],
    visualX: 75,
    visualY: 1160,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "ear",
  },
  "collaborator-foundation": {
    flavor: "Review often enough that people ask for you specifically.",
    effects: ["Highlights your most-trusted review", "Feeds the Collaborator attribute"],
    visualX: 115,
    visualY: 1000,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "pair",
  },
  "collaborator-side": {
    flavor: "Review across branches you do not work in yourself.",
    effects: ["Badges cross-branch reviews", "Feeds the Collaborator attribute"],
    visualX: 145,
    visualY: 830,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "inbox",
  },
  "collaborator-advanced": {
    flavor: "Keep other people's work moving without owning it.",
    effects: ["Surfaces your stewardship", "Feeds the Collaborator attribute"],
    visualX: 175,
    visualY: 480,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "handshake",
  },
  "collaborator-capstone": {
    flavor: "Other projects' work clears because of your judgement.",
    effects: ["Keystone glow on the Collaborator branch", "Grand reveal on unlock"],
    visualX: 200,
    visualY: 240,
    xpReward: 150,
    codeCoinReward: 8,
    icon: "star",
  },
  "maintainer-roots": {
    flavor: "Put a version into people's hands.",
    effects: ["Shows a release mark on your profile", "Feeds the Maintainer attribute"],
    visualX: 225,
    visualY: 1160,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "broom",
  },
  "maintainer-foundation": {
    flavor: "Keep a project releasable over time.",
    effects: ["Highlights your most-sustained project", "Feeds the Maintainer attribute"],
    visualX: 345,
    visualY: 1000,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "tag",
  },
  "maintainer-side": {
    flavor: "Close other people's issues so the queue means something.",
    effects: ["Badges triage work", "Feeds the Maintainer attribute"],
    visualX: 435,
    visualY: 830,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "shield",
  },
  "maintainer-advanced": {
    flavor: "Own the version a project is known by.",
    effects: ["Surfaces your release management", "Feeds the Maintainer attribute"],
    visualX: 525,
    visualY: 480,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "compass",
  },
  "maintainer-capstone": {
    flavor: "Keep a project healthy across years of its contributors.",
    effects: ["Keystone glow on the Maintainer branch", "Grand reveal on unlock"],
    visualX: 600,
    visualY: 240,
    xpReward: 150,
    codeCoinReward: 8,
    icon: "star",
  },
  "architect-roots": {
    flavor: "Change the shape of a system without changing what it does.",
    effects: ["Shows a restructure mark on your profile", "Feeds the Architect attribute"],
    visualX: 375,
    visualY: 1160,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "blueprint",
  },
  "architect-foundation": {
    flavor: "Break a system along seams that make sense.",
    effects: ["Highlights your most-modular system", "Feeds the Architect attribute"],
    visualX: 575,
    visualY: 1000,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "layers",
  },
  "architect-side": {
    flavor: "Give a subsystem an interface the rest of the code respects.",
    effects: ["Badges boundary work", "Feeds the Architect attribute"],
    visualX: 725,
    visualY: 830,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "flow",
  },
  "architect-advanced": {
    flavor: "A shape the project can keep building on.",
    effects: ["Surfaces your lasting structure", "Feeds the Architect attribute"],
    visualX: 875,
    visualY: 480,
    xpReward: 80,
    codeCoinReward: 4,
    icon: "grid",
  },
  "architect-capstone": {
    flavor: "Decisions that outlive everyone who made them.",
    effects: ["Keystone glow on the Architect branch", "Grand reveal on unlock"],
    visualX: 1000,
    visualY: 240,
    xpReward: 150,
    codeCoinReward: 8,
    icon: "star",
  },
  "bridge-builder-debugger": {
    flavor: "Land the repair you diagnosed, rather than only reporting it.",
    effects: ["Connects Builder and Debugger", "Feeds both attributes"],
    visualX: -460,
    visualY: 1000,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "link",
  },
  "bridge-debugger-scholar": {
    flavor: "Leave a record of why the failure happened.",
    effects: ["Connects Debugger and Scholar", "Feeds both attributes"],
    visualX: -230,
    visualY: 1000,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "link",
  },
  "bridge-scholar-collaborator": {
    flavor: "Explain an improvement where someone is already reading.",
    effects: ["Connects Scholar and Collaborator", "Feeds both attributes"],
    visualX: 0,
    visualY: 1000,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "link",
  },
  "bridge-collaborator-maintainer": {
    flavor: "Help keep someone else's project releasable.",
    effects: ["Connects Collaborator and Maintainer", "Feeds both attributes"],
    visualX: 230,
    visualY: 1000,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "link",
  },
  "bridge-maintainer-architect": {
    flavor: "Restructure a system you are also responsible for shipping.",
    effects: ["Connects Maintainer and Architect", "Feeds both attributes"],
    visualX: 460,
    visualY: 1000,
    xpReward: 40,
    codeCoinReward: 2,
    icon: "link",
  },
};

/** The same data keyed for `Map` lookups, shared by every skill-tree component. */
export const SKILL_NODE_PRESENTATION_BY_ID: ReadonlyMap<string, SkillNodePresentation> =
  new Map(Object.entries(SKILL_NODE_PRESENTATION));

/** The presentation for a skill id, or `undefined` if none is registered. */
export function presentationFor(id: string): SkillNodePresentation | undefined {
  return SKILL_NODE_PRESENTATION_BY_ID.get(id);
}
