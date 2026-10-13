/**
 * RootRealm — `GET /api/profile/cosmetics` (TASKS 13.3, 13.4).
 *
 * ```text
 * the session → what the developer is wearing
 * ```
 *
 * `/customization` is a server component, so it reads the wallet directly and
 * passes the result down. `/profile` is a client component — it has to be, to
 * resolve the session — so it cannot, and needs this to know what the developer
 * is wearing.
 *
 * Without it the profile hardcoded a frame, which is why equipping a cosmetic
 * there appeared to do nothing until a full page reload elsewhere. That is the
 * bug this endpoint exists to close: it is the missing half of "one wallet, read
 * once".
 *
 * ## Why it returns ids and not classes
 *
 * The response is `{ equipped: { slot: itemId } }` — data, not presentation. The
 * appearance classes live in `components/cosmetics/appearance.ts` and are applied
 * by the component that draws the frame, so this endpoint cannot leak a styling
 * decision into the transport and the two screens cannot drift by receiving
 * different class strings for the same item.
 *
 * ## Why signed-out is an empty map rather than a 401
 *
 * A visitor without an account wears nothing, which is a true statement about
 * their profile rather than a failure. It also lets the profile render its default
 * look instead of an error.
 */
import { userIdFromCookieHeader, wallets } from "@/lib/shop/service";
import { parseItemId, safeJson } from "@/lib/security/server";

import type { EquippedCosmetics } from "@/lib/cosmetics/equip";
import type { CosmeticSlot } from "@/lib/cosmetics/definition";

export const dynamic = "force-dynamic";

/** The slots the response may name. A closed set, so the shape cannot drift. */
const SLOTS: readonly CosmeticSlot[] = ["frame", "banner", "title", "theme", "effect"];

/** `GET /api/profile/cosmetics` → `{ equipped: { slot: itemId } }`. */
export async function GET(request: Request): Promise<Response> {
  const userId = userIdFromCookieHeader(request.headers.get("cookie"));

  if (userId === null) return safeJson({ equipped: {} });

  const wallet = await wallets.read(userId);
  const equipped: Record<string, string> = {};

  for (const slot of SLOTS) {
    const itemId = wallet.equipped[slot];
    // Ids travel through the same validator the shop accepts, so a stored value
    // that is somehow not a catalog id is dropped rather than returned.
    const parsed = parseItemId(itemId ?? null);
    if (parsed.ok) equipped[slot] = parsed.itemId;
  }

  return safeJson({ equipped });
}

export type EquippedResponse = { readonly equipped: Readonly<Record<string, string>> };

/** The equipped set, typed for the client hook that consumes it. */
export type EquippedBySlot = EquippedCosmetics;