export type ShopCategory = "Frames" | "Banners" | "Titles" | "Effects" | "Themes";

export type ShopItemRarity = "common" | "rare" | "epic";

export type ShopItem = {
  id: string;
  category: ShopCategory;
  name: string;
  description: string;
  rarity: ShopItemRarity;
  price: number;
  owned: boolean;
  equipped: boolean;
  accent: string;
};

export const SHOP_CATEGORIES: readonly ShopCategory[] = [
  "Frames",
  "Banners",
  "Titles",
  "Effects",
  "Themes",
];

export const MOCK_SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: "oblivion",
    category: "Frames",
    name: "Oblivion",
    description: "A minimal frame for those who build in the quiet.",
    rarity: "common",
    price: 0,
    owned: true,
    equipped: true,
    accent: "silver",
  },
  {
    id: "solar-flare",
    category: "Frames",
    name: "Solar Flare",
    description: "Brighten the edge of your developer identity.",
    rarity: "rare",
    price: 500,
    owned: false,
    equipped: false,
    accent: "amber",
  },
  {
    id: "fracture",
    category: "Frames",
    name: "Fracture",
    description: "A sharper silhouette for high-visibility builds.",
    rarity: "rare",
    price: 500,
    owned: false,
    equipped: false,
    accent: "blue",
  },
  {
    id: "verdant",
    category: "Frames",
    name: "Verdant",
    description: "Quiet green momentum for the steady shipper.",
    rarity: "common",
    price: 750,
    owned: false,
    equipped: false,
    accent: "green",
  },
  {
    id: "crimson-arc",
    category: "Frames",
    name: "Crimson Arc",
    description: "A strong signal of relentless delivery.",
    rarity: "rare",
    price: 750,
    owned: false,
    equipped: false,
    accent: "red",
  },
  {
    id: "eclipse",
    category: "Frames",
    name: "Eclipse",
    description: "A dark, controlled frame tuned for depth.",
    rarity: "epic",
    price: 1000,
    owned: false,
    equipped: false,
    accent: "white",
  },
];
