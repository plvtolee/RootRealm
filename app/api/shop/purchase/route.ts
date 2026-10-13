/**
 * RootRealm — `POST /api/shop/purchase` (TASKS 15.3 and 15.4).
 *
 * The atomic transaction the shop UI is connected to. The client sends an item
 * id and nothing else; the balance check, the charge and the ownership grant all
 * happen here in one indivisible step, and the response carries the resulting
 * state rather than a "success" the client has to reconcile.
 *
 * A refusal is 409 with the reason and the resulting view, because "you cannot
 * afford this" is information the shop renders, not an error to be logged.
 */
import { BAD_REQUEST, itemIdFrom, shopStateFor, UNAUTHENTICATED, userIdFromRequest, wallets } from "@/lib/shop/service";
import { logTransaction, serviceLogger } from "@/lib/ops/monitoring";

export const dynamic = "force-dynamic";

/** `POST /api/shop/purchase` — `{ itemId }` for the session's developer. */
export async function POST(request: Request): Promise<Response> {
  const userId = userIdFromRequest(request);
  if (userId === null) return UNAUTHENTICATED;

  const itemId = await itemIdFrom(request);
  if (itemId === null) return BAD_REQUEST;

  const outcome = await wallets.purchase({ userId, itemId, at: new Date().toISOString() });

  // TASKS 21.3: transaction failures are a monitored surface. A refusal is a
  // normal answer to a user (logged at info), except the unreachable
  // charged-without-granted state, which the emitter logs at error.
  logTransaction(outcome, { userId, itemId }, serviceLogger("shop"));

  if (!outcome.ok) {
    return Response.json(
      { error: outcome.refusal, view: await shopStateFor(userId) },
      { status: 409 },
    );
  }

  // TASKS 15.4: purchase → inventory → equip. The item is now owned, so the equip
  // is the same call the customization screen makes, and it cannot fail for lack
  // of ownership any more.
  const equipped = await wallets.equip({ userId, itemId });

  return Response.json(
    {
      purchased: { itemId: outcome.itemId, cost: outcome.cost },
      equipped: equipped.ok,
      view: await shopStateFor(userId),
    },
    { status: 200 },
  );
}