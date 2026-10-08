"use client";

import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import { MOCK_SHOP_ITEMS, SHOP_CATEGORIES, type ShopCategory, type ShopItem } from "./shop-data";

const RARITY_BADGE: Record<ShopItem["rarity"], "neutral" | "accent" | "warning"> = {
  common: "neutral",
  rare: "accent",
  epic: "warning",
};

function ShopItemCard({
  item,
  selected,
  onSelect,
}: {
  item: ShopItem;
  selected: boolean;
  onSelect: (item: ShopItem) => void;
}) {
  const ringClass =
    item.accent === "amber"
      ? "border-[#f0c968] shadow-[0_0_0_1px_rgba(240,201,104,0.4)]"
      : item.accent === "blue"
        ? "border-[#7db5ff] shadow-[0_0_0_1px_rgba(125,181,255,0.4)]"
        : item.accent === "green"
          ? "border-[#6ee7a6] shadow-[0_0_0_1px_rgba(110,231,166,0.4)]"
          : item.accent === "red"
            ? "border-[#f06f6f] shadow-[0_0_0_1px_rgba(240,111,111,0.4)]"
            : item.accent === "white"
              ? "border-white shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
              : "border-border-strong shadow-[0_0_0_1px_rgba(255,255,255,0.04)]";

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-lg border bg-surface p-3 text-left transition-colors duration-(--motion-fast) ease-standard",
        selected ? "border-border-strong bg-surface-secondary" : "border-border hover:border-border-strong",
      )}
    >
      <div className={cn("flex h-24 items-center justify-center rounded-md border border-border bg-bg", ringClass)}>
        <div className="flex size-16 items-center justify-center rounded-full border-[3px] border-current bg-surface-secondary text-text-secondary">
          <div className="h-7 w-7 rounded-full border border-current" />
        </div>
      </div>

      <div className="space-y-1">
        <Text variant="subheading" as="h3" className="text-text-primary">
          {item.name}
        </Text>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {item.owned ? (
          <Badge variant="neutral">Owned</Badge>
        ) : (
          <div className="flex items-center gap-2 text-label text-text-secondary">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-accent text-[10px] text-bg">◉</span>
            {item.price}
          </div>
        )}

        {!item.owned && !item.equipped ? (
          <button
            type="button"
            className="rounded-md border border-border bg-surface-secondary px-2 py-1 text-label text-text-primary"
          >
            Preview
          </button>
        ) : null}
      </div>
    </button>
  );
}

export function ShopScreen() {
  const [activeCategory, setActiveCategory] = useState<ShopCategory>("Frames");
  const [selectedItemId, setSelectedItemId] = useState<string>("oblivion");

  const visibleItems = useMemo(
    () => MOCK_SHOP_ITEMS.filter((item) => item.category === activeCategory),
    [activeCategory],
  );

  const selectedItem =
    visibleItems.find((item) => item.id === selectedItemId) ?? visibleItems[0] ?? MOCK_SHOP_ITEMS[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface/80 p-2">
        {SHOP_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={cn(
              "rounded-md px-4 py-2 text-label transition-colors duration-(--motion-fast) ease-standard",
              activeCategory === category
                ? "border border-border-strong bg-surface-secondary text-text-primary"
                : "border border-transparent bg-surface text-text-secondary hover:border-border hover:text-text-primary",
            )}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.7fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => (
            <ShopItemCard
              key={item.id}
              item={item}
              selected={selectedItem.id === item.id}
              onSelect={(next) => setSelectedItemId(next.id)}
            />
          ))}
        </div>

        <Card className="h-full border-border bg-surface-secondary p-5">
          <div className="flex items-center justify-center pt-2">
            <div className="relative flex size-48 items-center justify-center rounded-full border-[3px] border-border-strong bg-surface">
              <div className="absolute inset-3 rounded-full border border-border" />
              <Avatar
                name="plvtolee"
                initials="PL"
                size="xl"
                className="border-[3px] border-border bg-surface-secondary"
              />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <Text variant="heading" as="h2" className="text-text-primary">
              {selectedItem.name}
            </Text>
            <Text variant="body" className="text-text-secondary">
              {selectedItem.description}
            </Text>
            <div className="flex justify-center">
              <Badge variant={RARITY_BADGE[selectedItem.rarity]}>{ACHIEVEMENT_LABEL[selectedItem.rarity]}</Badge>
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-center rounded-md border px-4 py-3 text-subheading font-medium",
                selectedItem.equipped
                  ? "border-border-strong bg-surface text-text-primary"
                  : "border-border bg-surface-secondary text-text-primary",
              )}
            >
              {selectedItem.equipped ? "Equipped" : "Equip"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

const ACHIEVEMENT_LABEL: Record<ShopItem["rarity"], string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
};
