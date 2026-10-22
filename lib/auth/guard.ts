import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { accountStore } from "@/lib/db/stores";
import { userIdFromCookieHeader } from "@/lib/shop/service";

import { loginPath, safeNextPath } from "./next-path";
import type { Account } from "./account";

/**
 * Resolves the account behind the signed session cookie for a server render.
 *
 * Session verification and account lookup are deliberately both required: a
 * valid cookie whose account has been deleted is not an authenticated account.
 */
export async function accountFromCookieHeader(header: string | null): Promise<Account | null> {
  const userId = userIdFromCookieHeader(header);
  if (userId === null) return null;
  return accountStore().findById(userId);
}

/**
 * Requires a real account for a protected route, redirecting signed-out users
 * to the login wall with the current internal destination preserved.
 */
export async function requireAccount(next: string | null | undefined): Promise<Account> {
  const cookieStore = await cookies();
  const account = await accountFromCookieHeader(cookieStore.toString());

  if (account === null) {
    redirect(loginPath(safeNextPath(next)));
  }

  return account;
}
