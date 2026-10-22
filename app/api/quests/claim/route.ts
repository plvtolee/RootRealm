/** `POST /api/quests/claim` — claim one quest for the authenticated account. */
import { claimQuest, accountFor } from "@/lib/quests/service";
import { userIdFromRequest } from "@/lib/shop/service";
import { parseItemId, safeJson } from "@/lib/security/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const userId = userIdFromRequest(request);
  if (userId === null) {
    return safeJson(
      { error: "unauthenticated", message: "Sign in to claim quests." },
      { status: 401 },
    );
  }

  const account = await accountFor(userId);
  if (account === null) {
    return safeJson(
      { error: "not_found", message: "That account no longer exists." },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null) as { questId?: unknown } | null;
  const parsed = parseItemId(body?.questId);
  if (!parsed.ok) {
    return safeJson(
      { error: "bad_request", message: "Send { questId } as JSON." },
      { status: 400 },
    );
  }

  const outcome = await claimQuest({
    userId,
    login: account.login,
    questId: parsed.itemId,
    // The route intentionally does not accept events. The service obtains them
    // from the server-side profile snapshot for this account.
    at: new Date(),
  });

  if (!outcome.ok) {
    const status = outcome.refusal === "unknown_quest" ? 404 : 409;
    return safeJson(
      { error: outcome.refusal, message: outcome.message },
      { status },
    );
  }

  return safeJson({
    claimed: !outcome.duplicate,
    duplicate: outcome.duplicate,
    completion: outcome.result.completion,
    rewards: {
      xp: outcome.result.xpTransaction?.xp ?? 0,
      codeCoins: outcome.result.currencyTransaction?.amount ?? 0,
      cosmeticId: outcome.result.cosmeticGrant?.itemId ?? null,
    },
  });
}
