/**
 * RootRealm — cosmetic ownership (TASKS 13.2).
 *
 * ```text
 * inventory = the items a developer owns, each with how it was acquired
 * ```
 *
 * TASKS 13.2 is "implement ownership", which sounds like a flag on the catalog and
 * is the one thing a cosmetic catalog must not have. An `owned` column on
 * `CosmeticDefinition` would be a definition *per developer*, and the catalog is
 * shared content — the same mistake `quest_progress` and `skill_unlocks` both
 * avoid by keeping catalogue and state in different tables. So ownership lives
 * here, keyed by item id, and the catalog stays the catalog.
 *
 * ## Why the source is recorded
 *
 * An inventory that says only "owned" cannot explain *why* a developer holds a
 * legendary frame, and SCORING.md's explainability clauses (A17) apply to rewards
 * as much as to points. Each row keeps what granted it — a quest, a purchase — so
 * the shop and the profile can both answer "how did I get this".
 *
 * ## Why a grant is idempotent, and idempotent structurally
 *
 * Two paths grant an item: a quest completion (TASKS 12.3, whose
 * `CosmeticGrant.id` is already `inv:<userId>:<itemId>`) and a purchase (TASKS
 * 14.4). Both can be retried — a completion re-delivered, a purchase
 * double-submitted — and neither may produce a second copy. Because ownership is
 * a set of item ids and a row is created only when the item is absent, a retry is
 * a no-op by construction: there is no key for a caller to get wrong and no
 * duplicate row to reconcile. Same guarantee the XP and currency ledgers give,
 * reached structurally rather than by convention.
 *
 * ## Unknown items are a programming error, not a state
 *
 * Granting an item the catalog does not publish would create ownership of
 * something that renders as nothing. `grantCosmetic` throws, the way
 * `unlockAchievement` throws for an unmet achievement: it is a bug in a catalog or
 * a quest, never a decision the UI is allowed to make.
 */
import type { CosmeticGrant } from "../quests/completion";

import { COSMETIC_INDEX, DEFAULT_OWNED_IDS } from "./catalog";
import type { CosmeticIndex } from "./definition";

/** How an item entered the inventory. */
export type CosmeticSourceKind =
  /** Granted at signup with the zero-price starter set. */
  | "default"
  /** Granted by a quest completion (TASKS 12.3). */
  | "quest"
  /** Bought with CodeCoins (TASKS 14.4). */
  | "purchase";

/** One owned cosmetic. */
export interface InventoryItem {
  readonly itemId: string;
  readonly sourceKind: CosmeticSourceKind;
  /** The quest, or the purchase, that granted it. Null for the starter set. */
  readonly sourceId: string | null;
  /** When it was acquired, ISO-8601. Caller-owned, for determinism. */
  readonly acquiredAt: string;
}

/** What one developer owns. */
export interface Inventory {
  readonly userId: string;
  readonly items: readonly InventoryItem[];
}

/** The outcome of attempting a grant. */
export interface GrantResult {
  readonly inventory: Inventory;
  /** False when the item was already held: a retry, not a second copy. */
  readonly granted: boolean;
}

/** What a caller supplies to grant an item. */
export interface CosmeticGrantInput {
  readonly itemId: string;
  readonly sourceKind: CosmeticSourceKind;
  readonly sourceId: string | null;
  readonly acquiredAt: string;
}

/**
 * The idempotency key for a grant.
 *
 * The same shape `CosmeticGrant.id` already uses (TASKS 12.3), so a quest's grant
 * and a purchase of the same item produce one key per item and cannot collide.
 * Ownership does not need the key to *work* — the set membership is the
 * guarantee — but a caller persisting the rows needs one column to be unique on.
 */
export function inventoryKey(userId: string, itemId: string): string {
  return `inv:${userId}:${itemId}`;
}

/**
 * The starter inventory: the zero-price basics, granted rather than purchased.
 *
 * A developer with an empty inventory has no frame, no title and nothing to
 * preview, and the preview is the point of the screen. No currency transaction
 * exists for these — they were never bought, and the ledger must not pretend
 * otherwise.
 */
export function initialInventory(
  userId: string,
  acquiredAt: string,
  index: CosmeticIndex = COSMETIC_INDEX,
): Inventory {
  const items = DEFAULT_OWNED_IDS.flatMap((itemId) => {
    if (!index.byId.has(itemId)) return [];
    return [{ itemId, sourceKind: "default" as const, sourceId: null, acquiredAt }];
  });

  return { userId, items };
}

/** Whether a developer owns an item. */
export function ownsCosmetic(inventory: Inventory, itemId: string): boolean {
  return inventory.items.some((item) => item.itemId === itemId);
}

/** The owned ids as a set, for callers that only need membership. */
export function ownedItemIds(inventory: Inventory): ReadonlySet<string> {
  return new Set(inventory.items.map((item) => item.itemId));
}

/**
 * Grants an item, or reports that it is already held.
 *
 * A grant of an owned item returns the same inventory with `granted: false`:
 * "already granted" is a true statement about the world, not an error, so this
 * returns rather than throws. An item outside the catalog *does* throw — that one
 * is a bug (see the module header).
 */
export function grantCosmetic(
  inventory: Inventory,
  grant: CosmeticGrantInput,
  index: CosmeticIndex = COSMETIC_INDEX,
): GrantResult {
  if (!index.byId.has(grant.itemId)) {
    throw new Error(
      `Cannot grant ${grant.itemId}: it is not in the cosmetic catalog. ` +
        "A grant of an item nothing renders is a catalog bug, not a state.",
    );
  }

  if (ownsCosmetic(inventory, grant.itemId)) {
    return { inventory, granted: false };
  }

  return {
    granted: true,
    inventory: {
      userId: inventory.userId,
      items: [
        ...inventory.items,
        {
          itemId: grant.itemId,
          sourceKind: grant.sourceKind,
          sourceId: grant.sourceId,
          acquiredAt: grant.acquiredAt,
        },
      ],
    },
  };
}

/**
 * Applies a quest completion's cosmetic grant (TASKS 12.3).
 *
 * A thin adapter, kept here so the quest module never has to know what an
 * inventory is, and so the source is recorded as the quest it came from rather
 * than as whatever generic thing the caller passed in.
 */
export function grantFromQuestCompletion(
  inventory: Inventory,
  grant: CosmeticGrant,
  acquiredAt: string,
  index: CosmeticIndex = COSMETIC_INDEX,
): GrantResult {
  return grantCosmetic(
    inventory,
    { itemId: grant.itemId, sourceKind: "quest", sourceId: grant.sourceId, acquiredAt },
    index,
  );
}