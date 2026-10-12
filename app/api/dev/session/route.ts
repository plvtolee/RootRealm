/**
 * RootRealm — `POST /api/dev/session` (development only).
 *
 * Mints a signed session for a local developer and seeds their wallet, so the
 * shop's server boundary (TASKS 15.3) can be exercised without a configured
 * GitHub OAuth app. Phase 8 established the pattern: the code under test is
 * server-side, so a browser needs a server to reach it at all.
 *
 * ## Why it is gated, and gated hard
 *
 * The route returns 404 in production — not 403, not a disabled body: a disabled
 * endpoint is still an endpoint someone can probe, and this one can create a
 * session for any user id. It is a development harness with no counterpart in the
 * product, and the guard is the first statement so there is no way to reach the
 * body without passing it.
 */
import { issueSession, sessionCookieAttributes, SESSION_COOKIE } from "@/lib/auth/session";
import { readSessionSecret } from "@/lib/auth/config";
import { currencyKey, type CurrencyTransaction } from "@/lib/currency/ledger";
import { newWallet, type Wallet } from "@/lib/currency/store";
import { wallets } from "@/lib/shop/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }

  const secret = readSessionSecret();
  if (secret === null) {
    return Response.json(
      { error: "no_session_secret", message: "Set SESSION_SECRET to use the dev harness." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" && body.userId.length > 0 ? body.userId : "dev-user";
  const coins = typeof body?.coins === "number" && body.coins > 0 ? body.coins : 1_000;

  const at = new Date().toISOString();
  const funding: CurrencyTransaction = {
    id: currencyKey(userId, "adjustment", "dev-harness"),
    userId,
    amount: coins,
    reason: "adjustment",
    sourceId: "dev-harness",
    recordedAt: at,
  };

  await wallets.save(newWallet(userId, at, [funding]) as Wallet);

  const session = issueSession(userId, { secret });

  return Response.json(
    { userId, coins },
    {
      status: 200,
      headers: {
        "set-cookie": `${SESSION_COOKIE}=${session.value}; ${sessionCookieAttributes(false)}`,
      },
    },
  );
}