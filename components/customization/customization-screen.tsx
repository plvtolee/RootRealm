"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Reveal } from "@/components/motion/reveal";
import { AvatarFrame } from "@/components/profile/avatar-frame";
import {
  BANNER_WASH,
  FRAME_RING,
  RING_GAP,
  RING_WIDTH,
  THEME_ACCENT,
  appearanceOf,
  frameMotionFor,
} from "@/components/cosmetics/appearance";
import { cn } from "@/lib/cn";
import { DEFAULT_OWNED_IDS } from "@/lib/cosmetics/catalog";
import type { CosmeticRarity, CosmeticSlot } from "@/lib/cosmetics/definition";
import { equipOwnedDefaults, type EquippedCosmetics } from "@/lib/cosmetics/equip";
import { initialInventory, type Inventory } from "@/lib/cosmetics/inventory";
import {
  computeCustomizationView,
  type CosmeticOptionView,
  type CosmeticSlotView,
} from "@/lib/cosmetics/view";

/** What the server said, in one line the screen can show. */
const REFUSAL_COPY: Record<string, string> = {
  not_owned: "It is not in your collection yet.",
  unknown_item: "That item is not in the catalog.",
  unauthenticated: "Your authenticated session is required to change what you are wearing.",
  bad_request: "That change was not understood.",
};

/**
 * Rarity is display-only (SCORING.md §27), so it is mapped onto the semantic
 * badge tones rather than given product tokens of its own.
 */
const RARITY_TONE: Record<CosmeticRarity, "neutral" | "accent" | "warning"> = {
  common: "neutral",
  rare: "accent",
  epic: "accent",
  legendary: "warning",
};

/**
 * How an appearance becomes paint lives in `components/cosmetics/appearance.ts`.
 *
 * It used to be defined here, privately, and `/profile` carried its own copy — the
 * two drifted apart and equipping a frame visibly did nothing on the profile. The
 * catalog stores a key, never a colour (AGENTS.md rule 1), so that module is the
 * single place an appearance becomes paint.
 */

export type CustomizationScreenProps = {
  /**
   * What the developer owns.
   *
   * Defaults to the starter set so the screen renders before any account or
   * database is wired to it. Ownership is real state: an item not in this
   * inventory cannot be equipped, whatever the catalog says.
   */
  inventory?: Inventory;
  /**
   * What the developer is wearing, one item per slot.
   *
   * Read on the server from the same wallet the shop spends from, so a purchase
   * in the shop is already owned here. Defaults to the starter loadout.
   */
  equipped?: EquippedCosmetics;
  /** The previewed developer's login. Drives the avatar fallback. */
  login?: string;
  /** A GitHub avatar, when the account has one (TASKS 9.2). */
  avatarUrl?: string | null;
  className?: string;
};

/**
 * The customization screen (TASKS 13.4).
 *
 * ```tsx
 * // app/customization/page.tsx
 * <CustomizationScreen />
 * ```
 *
 * ## What changed from the prototype
 *
 * Every option used to come from `customization-data.ts`: hard-coded lists with no
 * catalog behind them, an `owned` concept that did not exist, and a "Save changes"
 * button that only wrote a line of text. Options now come from
 * `computeCustomizationView`, which joins the catalog (13.1), the inventory (13.2)
 * and the equipped set (13.3) — so an unowned item is locked for a reason and
 * equipping goes through the same rule the domain uses, not a local flag.
 *
 * ## Why equipping is local state for now
 *
 * ## Where the state lives
 *
 * Inventory and equipped state are read on the server (the same wallet the shop
 * spends from), and equip/unequip post to `/api/shop` before the page re-reads.
 * The prototype kept the loadout in component state and saved it with a button
 * that only wrote a line of text; holding a second copy here meant buying
 * something in the shop and not seeing it here, which is the opposite of what a
 * shared collection means.
 *
 * The equip *rule* is still `equipCosmetic`'s (TASKS 13.3) — the client never
 * decides, it posts an id and renders the server's answer.
 *
 * ## Why the avatar is not a section
 *
 * The prototype offered four avatar styles. Avatars are not cosmetics: there is
 * no catalog entry, no price and no ownership behind them, and DESIGN_SYSTEM §20
 * says the preview uses the current user's avatar. So the preview shows the
 * account's avatar, and the five sections are the five slots the catalog
 * publishes.
 */
export function CustomizationScreen({
  inventory,
  equipped,
  login = "plvtolee",
  avatarUrl = null,
  className,
}: CustomizationScreenProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeSlot, setActiveSlot] = useState<CosmeticSlot>("frame");
  const [notice, setNotice] = useState<string | null>(null);
  const [frameIntensity, setFrameIntensity] = useState(50);
  const [frameGlow, setFrameGlow] = useState(true);

  const owned = useMemo(
    () => inventory ?? initialInventory("guest", new Date(0).toISOString()),
    [inventory],
  );
  const worn: EquippedCosmetics = useMemo(
    () => equipped ?? equipOwnedDefaults(owned, DEFAULT_OWNED_IDS),
    [equipped, owned],
  );

  const view = useMemo(() => computeCustomizationView(owned, worn), [owned, worn]);

  const active = view.slots.find((section) => section.slot === activeSlot) ?? view.slots[0];

  /** Posts one change and lets the server page re-read the wallet. */
  function post(path: string, body: Record<string, string>, success: string): void {
    setNotice(null);

    void (async () => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      startTransition(() => {
        router.refresh();
        setNotice(
          response.ok ? success : (REFUSAL_COPY[payload?.error ?? ""] ?? "That did not go through."),
        );
      });
    })();
  }

  /** Equips an owned item, or explains why it cannot be equipped. */
  function select(option: CosmeticOptionView): void {
    if (!option.owned) {
      setNotice(
        option.definition.priceCodeCoins === null
          ? `${option.definition.name} is a quest reward — earn it from the quests that grant it.`
          : `${option.definition.name} costs ${option.definition.priceCodeCoins.toLocaleString("en-US")} CodeCoins and is not owned yet.`,
      );
      return;
    }

    post(
      "/api/shop",
      { itemId: option.definition.id },
      `${option.definition.name} equipped.`,
    );
  }

  function unequip(slot: CosmeticSlot): void {
    const section = view.slots.find((entry) => entry.slot === slot);
    post(
      "/api/shop/unequip",
      { slot },
      section?.equipped === null || section === undefined
        ? "Nothing was equipped."
        : `${section.equipped.name} removed.`,
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <Reveal>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Text variant="heading" as="h1">
          Customization
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral" size="sm">
            {view.ownedCount} of {view.totalCount} owned
          </Badge>
          <Badge variant="accent" size="sm">
            {view.emptySlots.length} slot{view.emptySlots.length === 1 ? "" : "s"} empty
          </Badge>
        </div>
      </header>
      </Reveal>

      <Reveal>
      <nav aria-label="Cosmetic slots" className="flex flex-wrap gap-2">
        {view.slots.map((section) => (
          <button
            key={section.slot}
            type="button"
            onClick={() => {
              setNotice(null);
              setActiveSlot(section.slot);
            }}
            aria-current={section.slot === activeSlot ? "true" : undefined}
            className={cn(
              "rounded-md border px-3 py-2 text-label transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
              section.slot === activeSlot
                ? "border-border-strong bg-surface-secondary text-text-primary"
                : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
            )}
          >
            {section.label}
          </button>
        ))}
      </nav>
      </Reveal>

      <Reveal className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border bg-surface-secondary p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Text variant="subheading" as="h2" className="text-text-primary">
              {active.label} options
            </Text>
            <Badge variant="neutral" size="sm">
              {active.options.length} items
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {active.options.map((option) => (
              <OptionCard
                key={option.definition.id}
                option={option}
                disabled={pending}
                onSelect={() => select(option)}
                onUnequip={() => unequip(active.slot)}
              />
            ))}
          </div>
        </Card>

        <div className="space-y-4">
              <PreviewCard
                key={view.slots.map((section) => section.equipped?.id ?? "none").join("-")}
                sections={view.slots}
            login={login}
            avatarUrl={avatarUrl}
            frameIntensity={frameIntensity}
            frameGlow={frameGlow}
          />

          <Card className="border-border bg-surface-secondary p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="frame-intensity" className="text-label text-text-primary">
                Frame intensity
              </label>
              <Text variant="caption" className="text-text-secondary">
                {frameIntensity}%
              </Text>
            </div>
            <input
              id="frame-intensity"
              type="range"
              min={0}
              max={100}
              step={25}
              value={frameIntensity}
              onChange={(event) => setFrameIntensity(Number(event.currentTarget.value))}
              aria-valuetext={`${frameIntensity} percent`}
              className="motion-transition-fast mt-3 w-full accent-accent hover:scale-(--motion-hover-scale) motion-reduce:transform-none"
            />
            <label className="mt-4 flex items-center gap-3 text-label text-text-secondary">
              <input
                type="checkbox"
                checked={frameGlow}
                onChange={(event) => setFrameGlow(event.currentTarget.checked)}
                className="size-4 accent-accent"
              />
              Frame glow
            </label>
            <Text variant="caption" className="mt-4 block text-text-muted">
              Frame motion is a preview control: intensity and glow change how the
              equipped effect reads, and neither is part of what the item owns.
            </Text>
          </Card>

          <Card className="border-border bg-surface-secondary p-4">
            <Text variant="subheading" as="h3" className="mb-3 text-text-primary">
              Equipped
            </Text>
            <div className="space-y-2">
              {view.slots.map((section) => (
                <div key={section.slot} className="flex items-center justify-between gap-3">
                  <Text variant="body" className="text-text-secondary">
                    {section.label}: {section.equipped?.name ?? "Nothing"}
                  </Text>
                  {section.equipped !== null ? (
                    <Button variant="secondary" size="sm" onClick={() => unequip(section.slot)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setNotice(null);
                    // Reset is five unequips, expressed as the five unequips it is:
                    // there is no "reset" verb in the domain, and inventing one
                    // here would be a second way to change the equipped set.
                    for (const section of view.slots) {
                      if (section.equipped !== null) {
                        post(
                          "/api/shop/unequip",
                          { slot: section.slot },
                          `${section.label} cleared.`,
                        );
                      }
                    }
                  }}
                >
                  Clear all
                </Button>
            </div>
            <div aria-live="polite" className="mt-4 min-h-(--shop-notice-min-height)">
              {notice ? (
                <Text variant="caption" className="text-text-secondary">
                  {notice}
                </Text>
              ) : null}
            </div>
          </Card>
        </div>
      </Reveal>
    </div>
  );
}

function OptionCard({
  option,
  disabled,
  onSelect,
  onUnequip,
}: {
  option: CosmeticOptionView;
  disabled: boolean;
  onSelect: () => void;
  onUnequip: () => void;
}) {
  const { definition, owned, equipped } = option;

  return (
    <div
      className={cn(
        "flex flex-col items-start rounded-lg border p-3 text-left transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
        equipped
          ? "border-border-strong bg-surface text-text-primary"
          : "border-border bg-surface text-text-secondary",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "mb-3 size-(--customization-option-swatch-size) rounded-md border",
          FRAME_RING[appearanceOf(definition.appearance)],
        )}
      />

      <Text variant="label" className="text-text-primary">
        {definition.name}
      </Text>
      <Text variant="caption" className="mt-1 text-text-muted">
        {definition.description}
      </Text>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={RARITY_TONE[definition.rarity]} size="sm">
          {definition.rarity}
        </Badge>
        {equipped ? (
          <Badge variant="success" size="sm">
            Equipped
          </Badge>
        ) : owned ? (
          <Badge variant="neutral" size="sm">
            Owned
          </Badge>
        ) : (
          <Badge variant="neutral" size="sm">
            {definition.priceCodeCoins === null
              ? "Quest reward"
              : `${definition.priceCodeCoins.toLocaleString("en-US")} CodeCoins`}
          </Badge>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {equipped ? (
          <Button variant="secondary" size="sm" disabled={disabled} onClick={onUnequip}>
            Unequip
          </Button>
        ) : (
          <Button
            variant={owned ? "primary" : "secondary"}
            size="sm"
            disabled={disabled}
            onClick={onSelect}
          >
            {owned ? "Equip" : "Locked"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PreviewCard({
  sections,
  login,
  avatarUrl,
  frameIntensity,
  frameGlow,
}: {
  sections: readonly CosmeticSlotView[];
  login: string;
  avatarUrl: string | null;
  frameIntensity: number;
  frameGlow: boolean;
}) {
  const definitionFor = (slot: CosmeticSlot) =>
    sections.find((section) => section.slot === slot)?.equipped ?? null;

  const banner = definitionFor("banner");
  const title = definitionFor("title");
  const frame = definitionFor("frame");
  const theme = definitionFor("theme");
  const effect = definitionFor("effect");

  return (
    <Card className="motion-state-enter overflow-hidden border-border bg-surface-secondary">
      <div
        className={cn(
          "flex h-(--customization-banner-height) items-end justify-between border-b border-border px-4 pb-3",
          BANNER_WASH[appearanceOf(banner?.appearance)],
        )}
      >
        <div className="space-y-1">
          <Text variant="label" className="text-text-secondary">
            {banner?.name ?? "No banner"}
          </Text>
          <Text variant="subheading" as="h2" className="text-text-primary">
            {title?.name ?? "No title"}
          </Text>
        </div>
        <Badge variant="neutral" size="sm">
          {effect?.name ?? "No effect"}
        </Badge>
      </div>

      <div className="flex items-center gap-4 px-4 py-6">
        <AvatarFrame
          mode={frameMotionFor(effect?.appearance)}
          intensity={frameIntensity}
          glow={frameGlow}
          className={cn(
            // The shared ring geometry: the same width and gap `/profile` draws,
            // so the two frames cannot end up different sizes.
            RING_WIDTH,
            RING_GAP,
            FRAME_RING[appearanceOf(frame?.appearance)],
          )}
        >
          {avatarUrl ? (
            <Avatar src={avatarUrl} alt={login} size="xl" className="border border-border" />
          ) : (
            <Avatar name={login} size="xl" className="border border-border" />
          )}
        </AvatarFrame>

        <div className="space-y-1">
          <Text variant="heading" as="h3" className={THEME_ACCENT[appearanceOf(theme?.appearance)]}>
            {login}
          </Text>
          <Text variant="body" className="text-text-secondary">
            {frame ? `${frame.name} frame` : "No frame equipped"}
          </Text>
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <Text variant="caption" className="text-text-muted">
          Preview only — the equipped loadout is held in this session until
          inventory storage is wired.
        </Text>
      </div>
    </Card>
  );
}
