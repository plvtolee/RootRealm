import type { Metadata } from "next";
import { cookies } from "next/headers";

import { CustomizationScreen } from "@/components/customization/customization-screen";
import { userIdFromCookieHeader, wallets } from "@/lib/shop/service";

export const metadata: Metadata = {
  title: "Customization",
};

/**
 * Customization reads the same wallet the shop spends from.
 *
 * A server page for the same reason the shop has one: what a developer owns and
 * wears is state, and a second copy of it in the browser is how "I bought this
 * and it is not here" happens. The screen posts an item id and re-reads.
 */
export const dynamic = "force-dynamic";

export default async function CustomizationPage() {
  const cookieStore = await cookies();
  const userId = userIdFromCookieHeader(cookieStore.toString());

  if (userId === null) {
    return null;
  }

  const wallet = await wallets.read(userId);

  return (
    <CustomizationScreen inventory={wallet.inventory} equipped={wallet.equipped} />
  );
}
