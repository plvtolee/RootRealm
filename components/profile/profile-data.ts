/**
 * RootRealm — static mock profile data (TASKS §2.1, Phase 2).
 *
 * This module is the single, clearly identified MOCK object behind the profile
 * screen. It exists so the first real screen can be built and reviewed before
 * any GitHub ingestion, scoring or persistence arrives:
 *
 * - every value here is illustrative mock data — there is no backend, no GitHub
 *   API call and no XP calculation behind it (TASKS §2.1 "Do NOT"; DATA_CONTRACT
 *   §13: presentation never calculates XP)
 * - the data lives apart from the presentational components: the screen in
 *   `components/profile/profile-screen.tsx` receives it as props and the section
 *   components stay data-agnostic
 * - types mirror the DATA_CONTRACT vocabulary where a contract exists
 *   (`AttributeType` §14, achievement `rarity` §18) so swapping this object for
 *   real API data later is a type-level change, not a rewrite
 */

/** The six character attributes — DATA_CONTRACT §14 `AttributeType`. */
export type AttributeKey =
  | "builder"
  | "debugger"
  | "scholar"
  | "collaborator"
  | "maintainer"
  | "architect";

/** One attribute summary tile: the contract's `AttributeProgress.value`. */
export type ProfileAttribute = {
  attribute: AttributeKey;
  /** Display name from the approved reference (`references/approved-ui/profile.png`). */
  label: string;
  /** Static illustrative value. Not derived from anything. */
  value: number;
};

/** Achievement rarity — DATA_CONTRACT §18 (`common | rare | epic | legendary`). */
export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

/** One recent-achievement highlight. `name` is mock copy for the screen reader. */
export type ProfileAchievement = {
  name: string;
  rarity: AchievementRarity;
};

/** The featured repository block from the approved reference. */
export type ProfileFeaturedProject = {
  name: string;
  description: string;
  /** Technology chips (TypeScript, Next.js, ...). Display text only. */
  stack: readonly string[];
  /** Star count as displayed — mock copy, no repository lookup. */
  starsLabel: string;
};

/** The current quest block from the approved reference. */
export type ProfileQuest = {
  title: string;
  description: string;
  /** Static progress snapshot. No quest engine runs behind it. */
  progress: number;
  target: number;
  /** CodeCoins reward shown on the card (PRD §11). Illustrative only. */
  rewardCoins: number;
};

/** Everything the profile screen renders, in one typed object. */
export type MockProfile = {
  /** GitHub-style handle; doubles as the avatar's accessible name. */
  username: string;
  /** Shows the verified marker next to the name (PRD §8 "verifies ownership"). */
  verified: boolean;
  /** Role line under the name: "Developer · AI/DS · Builder". */
  headline: string;
  location: string;
  /** Equipped character title shown in the pill badge. */
  title: string;
  level: number;
  xpCurrent: number;
  xpToNextLevel: number;
  attributes: readonly ProfileAttribute[];
  featuredProject: ProfileFeaturedProject;
  currentQuest: ProfileQuest;
  /** Newest four achievements; the remainder surface as "+N". */
  recentAchievements: readonly ProfileAchievement[];
  /** Count behind the "+N" tile that links to /achievements. */
  additionalAchievements: number;
};

/**
 * MOCK PROFILE — static, illustrative, disconnected.
 *
 * Values mirror `references/approved-ui/profile.png` where the reference shows
 * them (name, headline, location, title, level, XP, the six attribute values,
 * the featured project and the current quest) so the screen can be compared
 * against the approved design. Nothing here is computed, fetched or persisted.
 */
export const MOCK_PROFILE: MockProfile = {
  username: "plvtolee",
  verified: true,
  headline: "Developer · AI/DS · Builder",
  location: "Imphal, India",
  title: "Architect",
  level: 42,
  xpCurrent: 3240,
  xpToNextLevel: 5000,
  attributes: [
    { attribute: "builder", label: "Builder", value: 72 },
    { attribute: "debugger", label: "Debugger", value: 58 },
    { attribute: "scholar", label: "Scholar", value: 64 },
    { attribute: "collaborator", label: "Collaborator", value: 76 },
    { attribute: "maintainer", label: "Maintainer", value: 61 },
    { attribute: "architect", label: "Architect", value: 83 },
  ],
  featuredProject: {
    name: "RootRealm",
    description: "A developer identity platform with RPG-inspired progression.",
    stack: ["TypeScript", "Next.js"],
    starsLabel: "1.2k",
  },
  currentQuest: {
    title: "Make a Commit",
    description: "Make at least 1 commit today.",
    progress: 0,
    target: 1,
    rewardCoins: 50,
  },
  /*
    Ordered silver → violet → teal → gold to reproduce the hue sequence of the
    approved reference's achievement row; the names are mock copy (the reference
    shows glyphs only).
  */
  recentAchievements: [
    { name: "First Commit", rarity: "common" },
    { name: "Deep Work", rarity: "epic" },
    { name: "Reviewed", rarity: "rare" },
    { name: "Open Source Heart", rarity: "legendary" },
  ],
  additionalAchievements: 12,
};
