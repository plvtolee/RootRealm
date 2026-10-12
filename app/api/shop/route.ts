/**
 * RootRealm — `GET /api/shop` (TASKS 15.1 and 15.2).
 *
 * The shop's catalog and wallet for the signed-in developer. Deliberately thin:
 * one session, one store read, one view.
 *
 * The route is dynamic because the view is per-developer and computed per
 * request — nothing here is stored until Phase 10's schema has a driver.
 */
import { BAD_REQUEST, itemIdFrom, shopStateFor, UNAUTHENTICATED, userIdFromRequest, wallets } from "@/lib/shop/service";

export const dynamic = "force-dynamic";

/** `GET /api/shop` — the whole shop state for the session's developer. */
export async function GET(request: Request): Promise<Response> {
  const userId = userIdFromRequest(request);
  if (userId === null) return UNAUTHENTICATED;

  return Response.json({ view: await shopStateFor(userId) }, { status: 200 });
}

/**
 * `POST /api/shop` — equip or unequip an item the developer already owns.
 *
 * TASKS 15.4's third step. Equipping never grants and never charges, so a body
 * naming an item the developer does not own is refused by the same rule the
 * customization screen uses rather than by anything here.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = userIdFromRequest(request);
  if (userId === null) return UNAUTHENTICATED;

  const itemId = await itemIdFrom(request);
  if (itemId === null) return BAD_REQUEST;

  const outcome = await wallets.equip({ userId, itemId });
  if (!outcome.ok) {
    return Response.json({ error: outcome.refusal }, { status: 409 });
  }

  return Response.json({ view: await shopStateFor(userId) }, { status: 200 });
}