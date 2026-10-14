/**
 * RootRealm — `POST /api/sync` (TASKS 11.2–11.4).
 *
 * ```text
 * a signed-in developer asks → their GitHub activity is fetched, scored, and recorded once
 * ```
 *
 * ## Why POST and not GET
 *
 * Same reason `/api/auth/logout` is a POST. A sync writes: it records XP
 * transactions and achievement unlocks. A GET that writes is triggerable by any
 * image tag on any page, and a crawler's prefetch would silently award progress.
 *
 * ## Why there is no body
 *
 * The route takes no parameters. The developer being synced is read from the
 * session cookie and nowhere else — a body carrying a `username` would let a
 * caller sync *someone else's* account into *their own* ledger, which is not a
 * bug worth guarding against at the call site as well as here.
 *
 * ## What a repeat call does
 *
 * Nothing. The second call fetches, scores, finds every key already awarded, and
 * writes zero rows. That is the guarantee TASKS 11.3 asks for, and it is enforced
 * twice: the engine skips keys the store reports, and `xp_transactions.id` is the
 * primary key, so a bug in the first check still cannot double-award.
 */
import { runSync } from "@/lib/sync/service";
import { accountStore, progressionStore } from "@/lib/db/stores";
import { safeJson } from "@/lib/security/server";
import { userIdFromCookieHeader } from "@/lib/shop/service";
import { serviceLogger } from "@/lib/ops/monitoring";

export const dynamic = "force-dynamic";

/** `POST /api/sync`, no body. */
export async function POST(request: Request): Promise<Response> {
  const logger = serviceLogger("sync");

  const userId = userIdFromCookieHeader(request.headers.get("cookie"));

  if (userId === null) {
    return safeJson(
      { error: "unauthenticated", message: "Sign in to sync your account." },
      { status: 401 },
    );
  }

  const account = await accountStore().findById(userId);

  // A session naming an account that is gone — deleted, or minted against a
  // store that has since been reset. Not an error to report as one; it means
  // there is nothing to sync.
  if (account === null) {
    return safeJson(
      { error: "not_found", message: "That account no longer exists." },
      { status: 404 },
    );
  }

  const result = await runSync({
    userId,
    login: account.login,
    store: progressionStore(),
    // The request's own abort signal, so a browser that navigates away stops the
    // GitHub calls instead of finishing work nobody is waiting for.
    signal: request.signal,
  });

  if (!result.ok) {
    logger.warn("sync.refused", { login: account.login, refusal: result.refusal });

    return safeJson(
      { error: result.refusal, message: result.message, job: result.job },
      // GitHub declining is 502 — the upstream failed, this server did not.
      { status: result.refusal === "ingestion_failed" ? 502 : 400 },
    );
  }

  return safeJson({
    synced: true,
    login: account.login,
    xpAwarded: result.xpAwarded,
    achievementsUnlocked: result.achievementsUnlocked,
    totalXp: result.totalXp,
    counters: result.job.counters,
  });
}