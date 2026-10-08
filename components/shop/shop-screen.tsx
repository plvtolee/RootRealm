"use client";

import { useMemo, useState, type ComponentType } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CoinGlyph,
  GridGlyph,
  SparkleGlyph,
  StarGlyph,
  TagGlyph,
  type GlyphProps,
} from "@/components/ui/content-glyphs";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import { MOCK_SHOP_ITEMS, SHOP_CATEGORIES, type ShopCategory, type ShopItem } from "./shop-data";

type Accent = ShopItem["accent"];

const ACCENT_STYLE: Record<Accent, { text: string; border: string; wash: string; label: string }> = {
  silver: { text: "text-text-primary", border: "border-border-strong", wash: "bg-surface-secondary", label: "Monochrome" },
  amber: { text: "text-warning", border: "border-warning", wash: "bg-warning/10", label: "Amber" },
  blue: { text: "text-info", border: "border-info", wash: "bg-info/10", label: "Azure" },
  green: { text: "text-success", border: "border-success", wash: "bg-success/10", label: "Verdant" },
  red: { text: "text-danger", border: "border-danger", wash: "bg-danger/10", label: "Crimson" },
  white: { text: "text-text-primary", border: "border-text-secondary", wash: "bg-state-hover", label: "Obsidian" },
};

const RARITY_TONE: Record<ShopItem["rarity"], "neutral" | "accent" | "warning"> = {
  common: "neutral",
  rare: "accent",
  epic: "warning",
};

const CATEGORY_GLYPH: Record<ShopCategory, ComponentType<GlyphProps>> = {
  Frames: StarGlyph,
  Banners: GridGlyph,
  Titles: TagGlyph,
  Effects: SparkleGlyph,
  Themes: GridGlyph,
};

function ItemGlyph({ item, large = false }: { item: ShopItem; large?: boolean }) {
  const style = ACCENT_STYLE[item.accent];
  const CategoryGlyph = CATEGORY_GLYPH[item.category];

  if (item.category === "Frames") {
    return (
      <div className={cn("relative flex items-center justify-center rounded-full border border-dashed", style.border, large ? "size-(--shop-glyph-size-lg)" : "size-(--avatar-size-xl)")}>
        <span className={cn("absolute inset-2 rounded-full border", style.border)} />
        {large ? <Avatar name="plvtolee" initials="PL" size="xl" className={cn("border border-border-strong", style.wash)} /> : <span className={cn("relative text-heading", style.text)}>PL</span>}
      </div>
    );
  }

  if (item.category === "Banners") {
    return <div className={cn("flex w-full items-end overflow-hidden rounded-md border border-border p-3", style.wash, large ? "h-(--shop-banner-height-lg)" : "h-(--shop-banner-height-sm)")}><span className={cn("h-1 w-2/3 rounded-pill", style.text, "bg-current")} /></div>;
  }

  return (
    <div className={cn("flex items-center justify-center rounded-md border border-border", style.wash, large ? "size-(--shop-glyph-size-lg)" : "size-(--avatar-size-xl)")}>
      <CategoryGlyph className={cn("size-(--shop-category-glyph-size)", style.text)} />
    </div>
  );
}

function ShopItemCard({
  item,
  selected,
  onSelect,
  onPreview,
  onEquip,
}: {
  item: ShopItem;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onEquip: () => void;
}) {
  return (
    <Card padding="none" className={cn("group flex h-full flex-col overflow-hidden transition-colors duration-(--motion-base) ease-standard", selected && "border-border-strong")}>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex flex-1 flex-col p-4 text-left">
        <div className="mb-4 flex min-h-(--shop-item-preview-height) w-full items-center justify-center rounded-md border border-border bg-bg p-4 transition-colors duration-(--motion-base) ease-standard group-hover:bg-surface-secondary">
          <ItemGlyph item={item} />
        </div>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Text variant="subheading" as="h3" className="truncate text-text-primary">{item.name}</Text>
            <Text variant="caption" className="text-text-muted">{item.category.slice(0, -1) || item.category}</Text>
          </div>
          <Badge variant={RARITY_TONE[item.rarity]} size="sm">{item.rarity}</Badge>
        </div>
      </button>

      <div className="flex min-h-(--control-height-lg) items-center justify-between gap-3 border-t border-border px-4 py-3">
        {item.owned ? (
          <Text variant="caption" className="text-text-secondary">{item.equipped ? "Currently equipped" : "In your collection"}</Text>
        ) : (
          <span className="inline-flex items-center gap-2 text-label text-text-primary"><CoinGlyph className="size-(--icon-size-sm) text-warning" />{item.price.toLocaleString()}</span>
        )}
        <Button variant={item.owned ? "secondary" : "primary"} size="sm" onClick={item.owned ? onEquip : onPreview}>
          {item.owned ? (item.equipped ? "Equipped" : "Equip") : "Preview"}
        </Button>
      </div>
    </Card>
  );
}

export function ShopScreen() {
  const [items, setItems] = useState<readonly ShopItem[]>(MOCK_SHOP_ITEMS);
  const [balance, setBalance] = useState(1250);
  const [activeCategory, setActiveCategory] = useState<ShopCategory>("Frames");
  const [selectedItemId, setSelectedItemId] = useState("oblivion");
  const [notice, setNotice] = useState<string | null>(null);

  const visibleItems = useMemo(() => items.filter((item) => item.category === activeCategory), [items, activeCategory]);
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? visibleItems[0] ?? items[0];

  function selectCategory(category: ShopCategory) {
    setActiveCategory(category);
    const first = items.find((item) => item.category === category);
    if (first) setSelectedItemId(first.id);
    setNotice(null);
  }

  function equipItem(item: ShopItem) {
    if (!item.owned) return;
    setItems((current) => current.map((entry) => ({
      ...entry,
      equipped: entry.category === item.category ? entry.id === item.id : entry.equipped,
    })));
    setSelectedItemId(item.id);
    setNotice(`${item.name} equipped.`);
  }

  function purchaseItem(item: ShopItem) {
    if (item.owned) {
      equipItem(item);
      return;
    }
    if (balance < item.price) {
      setNotice("You need more CodeCoins to unlock this item.");
      return;
    }
    setBalance((current) => current - item.price);
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, owned: true, equipped: true } : {
      ...entry,
      equipped: entry.category === item.category ? false : entry.equipped,
    }));
    setNotice(`${item.name} added to your collection and equipped.`);
  }

  if (!selectedItem) return null;
  const selectedAccent = ACCENT_STYLE[selectedItem.accent];

  return (
    <div className="flex flex-col gap-8">
      <header className="relative overflow-hidden border-b border-border pb-6">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 hidden text-text-disabled lg:block">
          <svg viewBox="0 0 190 100" fill="none" className="w-(--shop-grid-width)"><path d="M190 0 90 100M150 0 50 100M110 0 10 100M70 0 0 70" stroke="currentColor" strokeWidth=".6" /></svg>
        </div>
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl space-y-3">
            <Text variant="label" className="text-text-muted">ROOTREALM / EXCHANGE</Text>
            <Text variant="display" as="h1" className="text-text-primary">The Shop</Text>
            <Text variant="body" className="text-text-secondary">Personalize your presence. Every piece is earned, collected, and yours to equip.</Text>
          </div>
          <Card variant="secondary" padding="md" className="flex w-fit items-center gap-4">
            <span aria-hidden="true" className="flex size-(--shop-balance-icon-size) items-center justify-center rounded-md border border-border bg-surface"><CoinGlyph className="size-(--icon-size-md) text-warning" /></span>
            <div>
              <Text variant="caption" className="block text-text-muted">YOUR BALANCE</Text>
              <Text variant="heading" as="p" className="text-text-primary">{balance.toLocaleString()} <span className="text-text-secondary">CC</span></Text>
            </div>
          </Card>
        </div>
      </header>

      <section aria-label="Featured item" className="grid overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-[1.2fr_0.8fr]">
        <div className="relative flex min-h-(--shop-featured-height) items-center justify-center overflow-hidden bg-surface-secondary p-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-border-strong" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border-strong" />
          </div>
          <div className={cn("relative flex size-(--shop-featured-glyph-size) items-center justify-center rounded-full border border-dashed", selectedAccent.border)}>
            <span className={cn("absolute inset-3 rounded-full border", selectedAccent.border)} />
            <div className="relative flex items-center justify-center"><ItemGlyph item={selectedItem} large /></div>
          </div>
          <span className="absolute bottom-4 left-4 text-label text-text-muted">LIVE PREVIEW / {selectedItem.category.toUpperCase()}</span>
        </div>

        <div className="flex flex-col justify-center p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Badge variant={RARITY_TONE[selectedItem.rarity]}>{selectedItem.rarity}</Badge>
            <Text variant="caption" className="text-text-muted">{selectedAccent.label} series</Text>
          </div>
          <Text variant="heading" as="h2" className="text-text-primary">{selectedItem.name}</Text>
          <Text variant="body" className="mt-3 text-text-secondary">{selectedItem.description}</Text>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {selectedItem.owned ? (
              <Button variant={selectedItem.equipped ? "secondary" : "primary"} size="lg" onClick={() => equipItem(selectedItem)}>
                {selectedItem.equipped ? "Currently equipped" : "Equip item"}
              </Button>
            ) : (
              <Button size="lg" onClick={() => purchaseItem(selectedItem)}>
                <CoinGlyph className="size-(--icon-size-md) text-warning" />{selectedItem.price.toLocaleString()} CC · Unlock
              </Button>
            )}
            {!selectedItem.owned ? <Text variant="caption" className="text-text-muted">One-time unlock</Text> : null}
          </div>
          <div aria-live="polite" className="mt-4 min-h-(--shop-notice-min-height)">
            {notice ? <Text variant="caption" className="text-text-secondary">{notice}</Text> : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="catalog-heading" className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Text variant="heading" as="h2" id="catalog-heading" className="text-text-primary">Browse the collection</Text>
            <Text variant="caption" className="text-text-muted">{visibleItems.length} pieces in {activeCategory.toLowerCase()}</Text>
          </div>
          <div role="group" aria-label="Shop categories" className="flex gap-2 overflow-x-auto pb-1">
            {SHOP_CATEGORIES.map((category) => {
              const active = activeCategory === category;
              const count = items.filter((item) => item.category === category).length;
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectCategory(category)}
                  className={cn(
                    "inline-flex min-h-(--control-height-md) shrink-0 items-center gap-2 rounded-md border px-3 text-label transition-colors duration-(--motion-fast) ease-standard",
                    active ? "border-border-strong bg-surface-secondary text-text-primary" : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
                  )}
                >
                  {category}<span className="text-caption text-text-muted">{String(count).padStart(2, "0")}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => (
            <ShopItemCard
              key={item.id}
              item={item}
              selected={selectedItem.id === item.id}
              onSelect={() => { setSelectedItemId(item.id); setNotice(null); }}
              onPreview={() => { setSelectedItemId(item.id); setNotice(null); }}
              onEquip={() => equipItem(item)}
            />
          ))}
        </div>
        {!visibleItems.length ? (
          <Card padding="lg" className="text-center">
            <Text variant="subheading" as="h3" className="text-text-primary">A new collection is on its way.</Text>
            <Text variant="body" className="mt-2 text-text-secondary">There are no {activeCategory.toLowerCase()} available just yet.</Text>
          </Card>
        ) : null}
      </section>
      <Text variant="caption" className="text-text-muted">Demo shop · purchases and equipment are stored for this session only.</Text>
    </div>
  );
}
