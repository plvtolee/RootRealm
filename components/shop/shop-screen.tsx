"use client";

import { useMemo, useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";

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
import { AvatarFrame, type AvatarFrameMode } from "@/components/profile/avatar-frame";
import { DevFundButton } from "@/components/dev/dev-fund-button";
import { cn } from "@/lib/cn";
import type { CosmeticRarity, CosmeticSlot } from "@/lib/cosmetics/definition";
import { SLOT_LABEL } from "@/lib/cosmetics/definition";
import {
  priceLabel,
  SHOP_SLOTS,
  type ShopItemView,
  type ShopViewState,
} from "@/lib/shop/view";

/**
 * An appearance key resolved to semantic tokens.
 *
 * The catalog stores a key, never a colour (AGENTS.md rule 1). Unknown keys fall
 * back to the neutral treatment: a cosmetic that renders as nothing is worse than
 * one that renders as the default.
 */
const APPEARANCE: Record<string, { swatch: string; wash: string; text: string }> = {
  neutral: {
    swatch: "border-border bg-surface-secondary",
    wash: "bg-surface-secondary",
    text: "text-text-primary",
  },
  amber: { swatch: "border-warning bg-warning/10", wash: "bg-warning/10", text: "text-warning" },
  cyan: { swatch: "border-info bg-info/10", wash: "bg-info/10", text: "text-info" },
  violet: { swatch: "border-accent bg-accent/10", wash: "bg-accent/10", text: "text-accent" },
};

/** The effect appearances that exist as frame motions (TASKS 3.2). */
const EFFECT_MODE: Record<string, AvatarFrameMode> = {
  none: "none",
  pulse: "pulse",
  haze: "haze",
  trail: "trail",
};

const RARITY_TONE: Record<CosmeticRarity, "neutral" | "accent" | "warning"> = {
  common: "neutral",
  rare: "accent",
  epic: "accent",
  legendary: "warning",
};

const SLOT_GLYPH: Record<CosmeticSlot, ComponentType<GlyphProps>> = {
  frame: StarGlyph,
  banner: GridGlyph,
  title: TagGlyph,
  theme: GridGlyph,
  effect: SparkleGlyph,
};

/** What the server said, translated into one line the screen can show. */
const REFUSAL_COPY: Record<string, string> = {
  insufficient_balance: "You need more CodeCoins for this one.",
  already_owned: "It is already in your collection.",
  already_charged: "This item was already charged for and is being reconciled.",
  not_purchasable: "This one is a quest reward — it is earned, not bought.",
  unknown_item: "That item is not in the catalog.",
  not_owned: "It is not in your collection yet.",
};

export type ShopScreenProps = {
  /**
   * The shop state for the signed-in developer.
   *
   * Read on the server (TASKS 15.3), which is why the screen takes a view rather
   * than fetching one: the balance and ownership it shows are the server's
   * answer, not a client's guess at it.
   */
  readonly view: ShopViewState | null;
  /** No trusted session: nothing here is for sale. */
  readonly signedOut?: boolean;
  /** The previewed developer's login, used for the avatar fallback. */
  readonly login?: string;
  /** A GitHub avatar, when the account has one (TASKS 9.2). */
  readonly avatarUrl?: string | null;
  /**
   * Render the development funding control in the signed-out state.
   *
   * Passed by the server page rather than read from `process.env` here, so the
   * flag is decided in one place (the page) and the component has no opinion
   * about environments.
   */
  readonly devHarness?: boolean;
  readonly className?: string;
};

/**
 * The shop screen (TASKS 15.1–15.4).
 *
 * ## What changed from the prototype
 *
 * The catalog is the real one (TASKS 13.1), the balance is the real ledger
 * balance, and the two actions are real transactions:
 *
 * - **15.1** rows come from `computeShopView` over the catalog and the wallet;
 * - **15.2** the preview paints the selected item on the developer's own avatar;
 * - **15.3** Buy posts an item id to `/api/shop/purchase`, where the balance
 *   check, the charge and the ownership grant happen together;
 * - **15.4** a purchase is followed by the equip, server-side, so "paid but not
 *   worn" is not a state the client can produce.
 *
 * ## Why the client never computes affordability
 *
 * The view carries an `affordable` flag so the button can be disabled, but the
 * decision belongs to the server at the moment of the request. A client that
 * decided for itself would be answering for a balance that may already have
 * changed — which is the race TASKS 14.4's atomic flow exists to close. So the
 * screen renders the refusal the server sends, including the case where an item
 * looked affordable a moment ago and no longer is.
 */
export function ShopScreen({ view, signedOut = false, devHarness = false, login = "plvtolee", avatarUrl = null, className }: ShopScreenProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [slot, setSlot] = useState<CosmeticSlot>("frame");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = pending;

  /**
   * Posts one action, then lets the server page re-render.
   *
   * The response's own view is discarded on purpose: the page reads the wallet
   * again, so what the screen shows after an action is the same read any other
   * render would get — not a state the client patched and is hoping matches.
   */
  function act(path: string, itemId: string): void {
    setNotice(null);

    void (async () => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        purchased?: { itemId: string; cost: number };
      };

      startTransition(() => {
        router.refresh();
        setNotice(
          body.purchased !== undefined
            ? `Unlocked for ${body.purchased.cost.toLocaleString("en-US")} CodeCoins and equipped.`
            : response.ok
              ? "Equipped."
              : (REFUSAL_COPY[body.error ?? ""] ?? "That did not go through."),
        );
      });
    })();
  }

  const items = useMemo(
    () => (view === null ? [] : view.items.filter((item) => item.slot === slot)),
    [view, slot],
  );

  const selected: ShopItemView | null = useMemo(() => {
    if (view === null) return null;
    const fromSlot = view.items.find((item) => item.definition.id === selectedId);
    if (fromSlot !== undefined && fromSlot.slot === slot) return fromSlot;
    return items[0] ?? view.items[0] ?? null;
  }, [view, items, selectedId, slot]);

  if (signedOut || view === null || selected === null) {
    return (
      <div className={cn("flex flex-col gap-6", className)}>
        <Text variant="heading" as="h1">
          The Shop
        </Text>
        <Card className="border-border bg-surface-secondary p-6">
          <Text variant="subheading" as="h2" className="text-text-primary">
            Sign in to open the shop
          </Text>
          <Text variant="body" className="mt-2 text-text-secondary">
            CodeCoins and purchased cosmetics belong to an account, so the shop
            needs a signed session before it can show a balance or sell anything.
          </Text>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => router.push("/api/auth/github")}>Sign in with GitHub</Button>
            {devHarness ? <DevFundButton label="Fund a development wallet" /> : null}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      <header className="flex flex-col gap-6 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl space-y-3">
          <Text variant="label" className="text-text-muted">
            ROOTREALM / EXCHANGE
          </Text>
          <Text variant="display" as="h1" className="text-text-primary">
            The Shop
          </Text>
          <Text variant="body" className="text-text-secondary">
            Every piece is earned, collected, and yours to equip. CodeCoins buy
            cosmetics only — never progression.
          </Text>
        </div>

        <Card variant="secondary" padding="md" className="flex w-fit items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-(--shop-balance-icon-size) items-center justify-center rounded-md border border-border bg-surface"
          >
            <CoinGlyph className="size-(--icon-size-md) text-warning" />
          </span>
          <div>
            <Text variant="caption" className="block text-text-muted">
              YOUR BALANCE
            </Text>
            <Text variant="heading" as="p" className="text-text-primary">
              {view.balance.toLocaleString()} <span className="text-text-secondary">CC</span>
            </Text>
          </div>
        </Card>
      </header>

      <section aria-label="Featured item" className="grid overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-[1.2fr_0.8fr]">
        <PreviewPanel item={selected} login={login} avatarUrl={avatarUrl} />

        <div className="flex flex-col justify-center p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Badge variant={RARITY_TONE[selected.definition.rarity]}>{selected.definition.rarity}</Badge>
            <Text variant="caption" className="text-text-muted">
              {SLOT_LABEL[selected.slot]}
            </Text>
          </div>

          <Text variant="heading" as="h2" className="text-text-primary">
            {selected.definition.name}
          </Text>
          <Text variant="body" className="mt-3 text-text-secondary">
            {selected.definition.description}
          </Text>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {selected.owned ? (
              <Button
                size="lg"
                variant={selected.equipped ? "secondary" : "primary"}
                loading={busy}
                onClick={() => void act("/api/shop", selected.definition.id)}
              >
                {selected.equipped ? "Currently equipped" : "Equip item"}
              </Button>
            ) : selected.purchasable ? (
              <>
                <Button
                  size="lg"
                  loading={busy}
                  onClick={() => void act("/api/shop/purchase", selected.definition.id)}
                >
                  <CoinGlyph className="size-(--icon-size-md) text-warning" />
                  {selected.definition.priceCodeCoins?.toLocaleString()} CC · Unlock
                </Button>
                {!selected.affordable ? (
                  <Text variant="caption" className="text-text-muted">
                    You need {(selected.definition.priceCodeCoins ?? 0) - view.balance} more.
                  </Text>
                ) : (
                  <Text variant="caption" className="text-text-muted">
                    One-time unlock
                  </Text>
                )}
              </>
            ) : (
              <Text variant="label" className="text-text-secondary">
                Earned from the quests that grant it.
              </Text>
            )}
          </div>

          <div aria-live="polite" className="mt-4 min-h-(--shop-notice-min-height)">
            {notice ? (
              <Text variant="caption" className="text-text-secondary">
                {notice}
              </Text>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="catalog-heading" className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Text variant="heading" as="h2" id="catalog-heading" className="text-text-primary">
              Browse the collection
            </Text>
            <Text variant="caption" className="text-text-muted">
              {view.ownedCount} of {view.totalCount} owned · {view.lockedCount} still to unlock
            </Text>
          </div>

          <div role="group" aria-label="Shop slots" className="flex gap-2 overflow-x-auto pb-1">
            {SHOP_SLOTS.map((entry) => {
              const active = entry === slot;
              const count = view.items.filter((item) => item.slot === entry).length;
              return (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSlot(entry);
                    setSelectedId(null);
                    setNotice(null);
                  }}
                  className={cn(
                    "inline-flex min-h-(--control-height-md) shrink-0 items-center gap-2 rounded-md border px-3 text-label transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
                    active
                      ? "border-border-strong bg-surface-secondary text-text-primary"
                      : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
                  )}
                >
                  {SLOT_LABEL[entry]}
                  <span className="text-caption text-text-muted">{String(count).padStart(2, "0")}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <ShopItemCard
              key={item.definition.id}
              item={item}
              selected={selected.definition.id === item.definition.id}
              busy={busy}
              onSelect={() => {
                setSelectedId(item.definition.id);
                setNotice(null);
              }}
              onEquip={() => void act("/api/shop", item.definition.id)}
              onPurchase={() => void act("/api/shop/purchase", item.definition.id)}
            />
          ))}
        </div>
      </section>

      <Text variant="caption" className="text-text-muted">
        Purchases and equips are recorded on the server. The wallet is held in
        memory until Phase 10 gives it a database, so a restart loses it.
      </Text>
    </div>
  );
}

/** The live preview: the selected item on the developer's own avatar (15.2). */
function PreviewPanel({
  item,
  login,
  avatarUrl,
}: {
  item: ShopItemView;
  login: string;
  avatarUrl: string | null;
}) {
  const appearance = APPEARANCE[item.definition.appearance] ?? APPEARANCE.neutral;
  const Glyph = SLOT_GLYPH[item.slot];
  const isEffect = item.slot === "effect";

  return (
    <div className="relative flex min-h-(--shop-featured-height) items-center justify-center overflow-hidden bg-surface-secondary p-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-border-strong" />
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border-strong" />
      </div>

      {isEffect ? (
        <AvatarFrame
          mode={EFFECT_MODE[item.definition.appearance] ?? "none"}
          intensity={75}
          glow
          className={cn("relative border-2 p-1", appearance.swatch)}
        >
          {avatarUrl ? (
            <Avatar src={avatarUrl} alt={login} size="xl" className="border border-border" />
          ) : (
            <Avatar name={login} size="xl" className="border border-border" />
          )}
        </AvatarFrame>
      ) : (
        <div
          className={cn(
            "relative flex size-(--shop-featured-glyph-size) items-center justify-center rounded-lg border border-dashed",
            appearance.swatch,
          )}
        >
          <Glyph className={cn("size-(--shop-category-glyph-size)", appearance.text)} />
        </div>
      )}

      <span className="absolute bottom-4 left-4 text-label text-text-muted">
        LIVE PREVIEW / {SLOT_LABEL[item.slot].toUpperCase()}
      </span>
    </div>
  );
}

function ShopItemCard({
  item,
  selected,
  busy,
  onSelect,
  onEquip,
  onPurchase,
}: {
  item: ShopItemView;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onEquip: () => void;
  onPurchase: () => void;
}) {
  const appearance = APPEARANCE[item.definition.appearance] ?? APPEARANCE.neutral;

  return (
    <Card
      padding="none"
      className={cn(
        "group flex h-full flex-col overflow-hidden transition-colors duration-(--motion-base) ease-standard motion-reduce:transition-none",
        selected && "border-border-strong",
      )}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex flex-1 flex-col p-4 text-left">
        <div className="mb-4 flex min-h-(--shop-item-preview-height) w-full items-center justify-center rounded-md border border-border bg-bg p-4 transition-colors duration-(--motion-base) ease-standard group-hover:bg-surface-secondary motion-reduce:transition-none">
          <div className={cn("size-(--avatar-size-xl) rounded-lg border", appearance.swatch)} aria-hidden="true" />
        </div>

        <div className="flex w-full items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Text variant="subheading" as="h3" className="truncate text-text-primary">
              {item.definition.name}
            </Text>
            <Text variant="caption" className="text-text-muted">
              {item.slotLabel}
            </Text>
          </div>
          <Badge variant={RARITY_TONE[item.definition.rarity]} size="sm">
            {item.definition.rarity}
          </Badge>
        </div>
      </button>

      <div className="flex min-h-(--control-height-lg) items-center justify-between gap-3 border-t border-border px-4 py-3">
        {item.owned ? (
          <Text variant="caption" className="text-text-secondary">
            {item.equipped ? "Currently equipped" : "In your collection"}
          </Text>
        ) : (
          <span className="inline-flex items-center gap-2 text-label text-text-primary">
            <CoinGlyph className="size-(--icon-size-sm) text-warning" />
            {priceLabel(item)}
          </span>
        )}

        {item.owned ? (
          <Button variant="secondary" size="sm" loading={busy} onClick={onEquip}>
            {item.equipped ? "Equipped" : "Equip"}
          </Button>
        ) : item.purchasable ? (
          <Button size="sm" loading={busy} onClick={onPurchase}>
            Unlock
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onSelect}>
            Preview
          </Button>
        )}
      </div>
    </Card>
  );
}