/**
 * RootRealm — the initial cosmetic catalog (TASKS 13.1).
 *
 * A deliberately small starting set: two or three per slot. Each is priced in
 * CodeCoins except the quest reward, which is not purchasable at all — an item
 * that is both a reward and a purchase would mean a developer could pay for
 * something the quest was meant to grant.
 *
 * The `appearance` keys are mapped to semantic tokens by the customization
 * screen; the catalog stores the key, never a colour (AGENTS.md rule 1).
 */
import { indexCosmetics, type CosmeticDefinition } from "./definition";

/** The starting catalog. */
export const COSMETIC_DEFINITIONS: readonly CosmeticDefinition[] = [
  // Frames
  {
    id: "frame-minimal",
    slot: "frame",
    name: "Minimal",
    description: "A single hairline ring.",
    rarity: "common",
    priceCodeCoins: 0,
    appearance: "neutral",
  },
  {
    id: "frame-forge",
    slot: "frame",
    name: "Forge",
    description: "A warm ring, earned by publishing a release.",
    rarity: "rare",
    priceCodeCoins: null,
    appearance: "amber",
  },
  {
    id: "frame-signal",
    slot: "frame",
    name: "Signal",
    description: "A cool ring with a steady inner line.",
    rarity: "rare",
    priceCodeCoins: 250,
    appearance: "cyan",
  },

  // Banners
  {
    id: "banner-graphite",
    slot: "banner",
    name: "Graphite",
    description: "The default neutral wash.",
    rarity: "common",
    priceCodeCoins: 0,
    appearance: "neutral",
  },
  {
    id: "banner-violet",
    slot: "banner",
    name: "Violet Field",
    description: "A restrained accent wash.",
    rarity: "epic",
    priceCodeCoins: 400,
    appearance: "violet",
  },

  // Titles
  {
    id: "title-builder",
    slot: "title",
    name: "Builder",
    description: "For developers who ship.",
    rarity: "common",
    priceCodeCoins: 0,
    appearance: "neutral",
  },
  {
    id: "title-scholar",
    slot: "title",
    name: "Scholar",
    description: "For the documentation-minded.",
    rarity: "rare",
    priceCodeCoins: 200,
    appearance: "neutral",
  },

  // Themes
  {
    id: "theme-graphite",
    slot: "theme",
    name: "Graphite",
    description: "The default monochrome interface.",
    rarity: "common",
    priceCodeCoins: 0,
    appearance: "neutral",
  },
  {
    id: "theme-ember",
    slot: "theme",
    name: "Ember",
    description: "A warm accent on the same monochrome base.",
    rarity: "epic",
    priceCodeCoins: 500,
    appearance: "amber",
  },

  // Effects
  {
    id: "effect-none",
    slot: "effect",
    name: "None",
    description: "No decorative effect.",
    rarity: "common",
    priceCodeCoins: 0,
    appearance: "none",
  },
  {
    id: "effect-pulse",
    slot: "effect",
    name: "Pulse",
    description: "A slow ring around the portrait.",
    rarity: "legendary",
    priceCodeCoins: 900,
    appearance: "pulse",
  },
];

/** The catalog, indexed. */
export const COSMETIC_INDEX = indexCosmetics(COSMETIC_DEFINITIONS);

/**
 * The cosmetics owned by default.
 *
 * A developer needs *something* equipped, and granting the zero-price basics
 * avoids a profile with an empty frame and no title. They are granted, not
 * purchased: no currency transaction exists for them.
 */
export const DEFAULT_OWNED_IDS: readonly string[] = [
  "frame-minimal",
  "banner-graphite",
  "title-builder",
  "theme-graphite",
  "effect-none",
];