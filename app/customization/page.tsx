import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DevFundButton } from "@/components/dev/dev-fund-button";
import { CustomizationScreen } from "@/components/customization/customization-screen";
import { Text } from "@/components/ui/text";
import { initialInventory } from "@/lib/cosmetics/inventory";
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
    // A visitor still sees the collection and the preview — the screen is a
    // product surface, not an account screen — but the equip controls are off,
    // because there is no wallet to write to.
    return (
      <div className="flex flex-col gap-4">
        <CustomizationScreen
          inventory={initialInventory("guest", new Date(0).toISOString())}
          signedOut
        />
        <div className="flex flex-col gap-2">
          {process.env.NODE_ENV !== "production" ? (
            <>
              <DevFundButton />
              <Text variant="caption" className="text-text-muted">
                Development only: funds a wallet so the equip controls have
                something to write to. Without it, sign in with GitHub.
              </Text>
            </>
          ) : (
            <Text variant="caption" className="text-text-muted">
              Sign in with GitHub to equip what you own.
            </Text>
          )}
        </div>
      </div>
    );
  }

  const wallet = await wallets.read(userId);

  return (
    <CustomizationScreen inventory={wallet.inventory} equipped={wallet.equipped} />
  );
}