/**
 * RootRealm — `POST /api/shop/unequip` (TASKS 13.3).
 *
 * Taking an item off is a server operation for the same reason putting one on
 * is: the equipped set is state the shop and the profile both read, and the
 * customization screen should not hold a copy of it that only it knows about. The
 * item stays owned — unequipping is not a refund.
 */
import { COSMETIC_SLOTS, type CosmeticSlot } from "@/lib/cosmetics/definition";
import { shopStateFor, UNAUTHENTICATED, userIdFromRequest, wallets } from "@/lib/shop/service";

export const dynamic = "force-dynamic";

/** `POST /api/shop/unequip` — `{ slot }` for the session's developer. */
export async function POST(request: Request): Promise<Response> {
  const userId = userIdFromRequest(request);
  if (userId === null) return UNAUTHENTICATED;

  const body = await request.json().catch(() => null);
  const slot = (body as { slot?: unknown } | null)?.slot;

  // Checked against the closed slot union: an unknown slot is a 400 rather than
  // an unequip of a slot that does not exist, which would silently succeed.
  if (typeof slot !== "string" || !COSMETIC_SLOTS.includes(slot as CosmeticSlot)) {
    return Response.json(
      { error: "bad_request", message: "Send { slot } with a known cosmetic slot." },
      { status: 400 },
    );
  }

  await wallets.unequip({ userId, slot: slot as CosmeticSlot });

  return Response.json({ view: await shopStateFor(userId) }, { status: 200 });
}