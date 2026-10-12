import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ShopScreen } from "@/components/shop/shop-screen";
import { shopStateFor, userIdFromCookieHeader } from "@/lib/shop/service";

export const metadata: Metadata = {
  title: "Shop",
};

/**
 * The shop reads the session and the wallet on the server (TASKS 15.3).
 *
 * A server page rather than a client fetch, for one reason: what the shop shows —
 * a balance, what is owned, what is worn — is the server's answer. The client
 * posts an item id and re-renders; it never assembles the state itself.
 */
export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const cookieStore = await cookies();
  const userId = userIdFromCookieHeader(cookieStore.toString());

  if (userId === null) {
    return <ShopScreen view={null} signedOut />;
  }

  return <ShopScreen view={await shopStateFor(userId)} />;
}