/**
 * RootRealm's published Home updates.
 *
 * This is intentionally repo-managed for the first version of the updates hub.
 * A post is published by changing this file, so the Home feed never invents an
 * announcement from live product state. A future editor can replace this module
 * without changing the feed or detail-page contract.
 */

export const UPDATE_CATEGORIES = [
  "all",
  "seasons",
  "cosmetics",
  "patch-notes",
  "announcements",
] as const;

export type UpdateCategory = (typeof UPDATE_CATEGORIES)[number];
export type PublishedUpdateCategory = Exclude<UpdateCategory, "all">;

export type PublishedUpdate = {
  readonly slug: string;
  readonly category: PublishedUpdateCategory;
  readonly label: string;
  readonly title: string;
  readonly summary: string;
  readonly publishedAt: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly paragraphs: readonly string[];
};

export const PUBLISHED_UPDATES: readonly PublishedUpdate[] = [
  {
    slug: "third-season-is-underway",
    category: "seasons",
    label: "Season",
    title: "Third Season is underway",
    summary:
      "The current season runs through November 30, with rank points counted separately from lifetime XP.",
    publishedAt: "2026-10-15",
    actionLabel: "View leaderboard",
    actionHref: "/leaderboard",
    paragraphs: [
      "Third Season is the current RootRealm season. Developers who opt in and meet the published evidence requirements can appear on the ladder.",
      "Rank points are calculated from eligible activity inside the season window. They do not rewrite your lifetime XP, attributes, achievements or skill unlocks.",
      "The leaderboard is refreshed from verifiable GitHub activity when you visit it, so the standing shown there remains tied to the evidence RootRealm can explain.",
    ],
  },
  {
    slug: "cosmetic-catalogue-is-live",
    category: "cosmetics",
    label: "Cosmetics",
    title: "The cosmetic catalogue is live",
    summary:
      "Spend CodeCoins on frames, banners, titles, themes and effects, then equip what belongs to your character.",
    publishedAt: "2026-10-12",
    actionLabel: "Open the shop",
    actionHref: "/shop",
    paragraphs: [
      "The catalogue now has a small, deliberate starting set across the main cosmetic slots. Default items are available immediately; priced items use CodeCoins earned through RootRealm progression.",
      "Purchases, inventory and equipped items are kept separate. Buying an item adds it to your inventory, and equipping it changes only the way your character is presented.",
      "The catalogue will grow through published releases rather than a stream of unannounced items.",
    ],
  },
  {
    slug: "claimable-quests-are-here",
    category: "patch-notes",
    label: "Patch notes",
    title: "Quests now have real rewards",
    summary:
      "Complete an evidence-backed quest, claim it once, and receive the XP, CodeCoins or cosmetic reward attached to it.",
    publishedAt: "2026-10-10",
    actionLabel: "View quests",
    actionHref: "/quests",
    paragraphs: [
      "Quest cards now distinguish between progress that has been observed and rewards that have been claimed. The claim decision is made on the server from the same normalized activity used by the profile.",
      "Claims are idempotent: retrying a request cannot award the same quest twice. A completed quest also records the supporting event so the reward has an explanation.",
      "This release also adds clearer loading and error states to the quest screen.",
    ],
  },
  {
    slug: "progression-now-persists",
    category: "announcements",
    label: "Announcement",
    title: "Progression now stays with your account",
    summary:
      "Skill unlocks and quest completions are now connected to the signed-in account instead of living only in the screen.",
    publishedAt: "2026-10-09",
    actionLabel: "Open skill tree",
    actionHref: "/skill-tree",
    paragraphs: [
      "When you unlock a skill, RootRealm records that unlock and loads it again when the skill tree is opened later. Refunds go through the same server boundary.",
      "Quest completions follow the same rule. The UI renders persisted state; it does not decide whether a reward should be granted.",
      "The database migration for quest completions is part of the release and must be applied before a deployed database can store those claims.",
    ],
  },
];

const UPDATE_INDEX = new Map(PUBLISHED_UPDATES.map((update) => [update.slug, update]));

export function getPublishedUpdate(slug: string): PublishedUpdate | null {
  return UPDATE_INDEX.get(slug) ?? null;
}

export function isUpdateCategory(value: string | null | undefined): value is UpdateCategory {
  return value !== undefined && value !== null && UPDATE_CATEGORIES.includes(value as UpdateCategory);
}

export function updatesForCategory(category: UpdateCategory): readonly PublishedUpdate[] {
  if (category === "all") return PUBLISHED_UPDATES;
  return PUBLISHED_UPDATES.filter((update) => update.category === category);
}

export function formatUpdateDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
