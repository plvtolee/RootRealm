/**
 * RootRealm — the shop's server boundary (TASKS 15.3 and 15.4).
 *
 * ```text
 * a signed-in request → the shop's view, or an equip / purchase decision
 * ```
 *
 * TASKS 15.3 asks for the UI to be connected to an *atomic backend transaction*
 * and 15.4 for purchase → inventory → equip. Both live behind this module so the
 * routes stay thin and, more importantly, so the client never decides anything
 * about money: it sends an item id and renders what comes back.
 *
 * ## Why the session decides who is buying
 *
 * The request body carries an item id and nothing else. The user comes from the
 * signed session cookie (TASKS 9.1). A body that named the buyer would be a
 * client that can buy for anyone, which is the one thing a currency system must
 * not allow.
 */
import { readSessionSecret } from "../auth/config";
import { SESSION_COOKIE, SessionError, verifySession } from "../auth/session";
import {
  walletBalance,
  walletStore,
  type WalletStore,
} from "../currency/store";
import { assertServerOnly } from "../github/server-only";

import { parseItemId, safeJson } from "../security/server";

import { computeShopView, type ShopViewState } from "./view";

/**
 * The process-wide wallet store.
 *
 * A `globalThis` singleton (see `walletStore`), not a module-level one: the shop
 * page and the shop routes are separate bundles, and two copies of the store
 * would mean a purchase made through the API was invisible to the page.
 * Explicitly a placeholder — Phase 10 replaces it with a database, at which point
 * this line and its comment disappear and the interface does not.
 */
export const wallets: WalletStore = walletStore();

/** Reads one cookie value from a `Cookie` header. */
function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/**
 * The signed-in developer, or null.
 *
 * Null for every way a session can fail to be trusted — absent, malformed,
 * mis-signed, expired — because they are one answer to the caller: this request
 * buys nothing. `verifySession` throws on all of them and the reason is a server
 * detail rather than something a route should branch on.
 */
export function userIdFromCookieHeader(header: string | null): string | null {
  assertServerOnly("userIdFromCookieHeader");

  const secret = readSessionSecret();
  if (secret === null) return null;

  try {
    return verifySession(readCookie(header, SESSION_COOKIE), { secret }).userId;
  } catch (error) {
    if (error instanceof SessionError) return null;
    throw error;
  }
}

/** The same answer, read from a route's request. */
export function userIdFromRequest(request: Request): string | null {
  return userIdFromCookieHeader(request.headers.get("cookie"));
}

/** The shop's view for one developer. */
export async function shopStateFor(userId: string): Promise<ShopViewState> {
  assertServerOnly("shopStateFor");

  const wallet = await wallets.read(userId);
  return computeShopView({
    userId,
    inventory: wallet.inventory,
    equipped: wallet.equipped,
    transactions: wallet.transactions,
  });
}

/** The coin balance for one developer, for the shop header. */
export async function balanceFor(userId: string): Promise<number> {
  assertServerOnly("balanceFor");

  return walletBalance(await wallets.read(userId));
}

/** The 401 every shop route answers with when there is no trusted session. */
export const UNAUTHENTICATED = safeJson(
  {
    error: "unauthenticated",
    message: "Sign in with GitHub to use the shop.",
  },
  { status: 401 },
);

/** The 400 for a body that is not a purchase or equip request. */
export const BAD_REQUEST = safeJson(
  { error: "bad_request", message: "Send { itemId } as JSON." },
  { status: 400 },
);

/**
 * Reads an `itemId` from a JSON body.
 *
 * The shape is validated here rather than in each route: a catalog id is bounded
 * and safe to use as a key or a URL, so anything else is a 400 before it reaches
 * the purchase flow. Returns null for a body that is not JSON or carries no item
 * id. The id is a catalog lookup in both the purchase and the equip path, so
 * nothing downstream has to defend against a shape.
 */
export function itemIdFrom(request: Request): Promise<string | null> {
  return request
    .json()
    .then((body: unknown) => {
      const parsed = parseItemId((body as { itemId?: unknown } | null)?.itemId);
      return parsed.ok ? parsed.itemId : null;
    })
    .catch(() => null);
}