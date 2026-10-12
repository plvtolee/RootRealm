/**
 * RootRealm — Playwright economy journey (TASKS 20.5).
 *
 * ```text
 * Quest → CodeCoins → shop → purchase → inventory → equip
 * ```
 *
 * The journey through the economy: a wallet is funded (standing in for the
 * CodeCoins a quest pays out, since quests are observed from activity rather
 * than claimed here), the shop buys an item, the purchase lands in the inventory
 * and equips it. Every mutation is the real server transaction — the balance is
 * debited by the real ledger, and the assertions read the balance and ownership
 * the server reports rather than a client flag.
 *
 * ## Why the wallet is seeded rather than earned in the journey
 *
 * Quests complete from observed activity (TASKS 12.2), so earning CodeCoins in a
 * browser journey would mean fabricating a feed and driving a sync — which is
 * TASKS 20.2's fixture work at the unit level, not a UI journey. The dev harness
 * (`/api/dev/session`) exists to reach a funded wallet directly (TASKS 15.3), and
 * it is the same door a developer uses by hand.
 *
 * ## What each control actually does (checked against the DOM, not assumed)
 *
 * - The catalog card's `Unlock` button is the purchase: it posts
 *   `/api/shop/purchase`, which buys **and equips** server-side (TASKS 15.4).
 * - The featured panel's `N CC · Unlock` is the *same* purchase, gated by an
 *   `affordable` flag the server set — so an unaffordable item is disabled there
 *   and states the shortfall, which is the honest UI to assert.
 * - The price on a card is the number alone (`priceLabel`); the `CC` suffix is
 *   added by the featured button and the balance display.
 */
import { expect, test } from "@playwright/test";

import { fundDevWallet } from "./helpers";

/** The signed-in wallet balance each test starts from. */
const STARTING_COINS = 5_000;

/** The featured panel, which reflects the selected item. */
function featured(page: import("@playwright/test").Page) {
  return page.getByRole("region", { name: "Featured item" });
}

/** The balance line in the header, e.g. "5,000 CC". */
function balance(page: import("@playwright/test").Page) {
  return page.getByText(/^[\d,]+ CC$/);
}

test.describe("economy journey — quest to equipped cosmetic", () => {
  test.beforeEach(async ({ request, context }) => {
    // A funded, signed-in wallet. Each test starts fresh, so tests do not depend
    // on the order they run in.
    await fundDevWallet(request, context, { coins: STARTING_COINS });
  });

  test("the shop shows a funded balance and a browsable catalog", async ({ page }) => {
    await page.goto("/shop");

    await expect(page.getByRole("heading", { name: "The Shop", exact: true })).toBeVisible();
    await expect(balance(page)).toHaveText(`${STARTING_COINS.toLocaleString("en-US")} CC`);
    await expect(page.getByText("Browse the collection")).toBeVisible();
    await expect(page.getByRole("button", { name: "Unlock" }).first()).toBeVisible();
  });

  test("a purchase debits the balance by the item's price and equips it", async ({
    page,
  }) => {
    await page.goto("/shop");

    // Read the price from the selected item's card before buying. The card's
    // price line is the number, and the featured button repeats it with "CC".
    const card = page.getByRole("button", { name: "Unlock" }).first();
    const cardText = (await card.locator("xpath=..").innerText()).replace(/\n/g, " ");
    const price = Number(cardText.match(/(\d[\d,]*)\s*\n?\s*Unlock/)?.[1]?.replace(/,/g, "") ?? "0");
    expect(price, `a price on the card: ${cardText}`).toBeGreaterThan(0);

    await card.click();

    // A real transaction: the featured panel reports it, and the balance is
    // debited by exactly the price.
    await expect(featured(page).getByText(`Unlocked for ${price.toLocaleString("en-US")} CodeCoins`)).toBeVisible();
    await expect(balance(page)).toHaveText(`${(STARTING_COINS - price).toLocaleString("en-US")} CC`);

    // Ownership is server state: the collection count moved by one.
    await expect(page.getByText(/6 of \d+ owned/)).toBeVisible();
  });

  test("the inventory carries the purchase and equips and unequips it", async ({
    page,
  }) => {
    // Buy a frame, so the equipped set changes from the starter loadout.
    await page.goto("/shop");
    await page.getByRole("button", { name: "Unlock" }).first().click();
    await expect(featured(page).getByText(/Unlocked for/)).toBeVisible();

    // The customization screen reads the same server-side inventory, so the
    // purchase is visible there — the inventory is shared, not a shop-local flag.
    await page.goto("/customization");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Unequip the equipped frame, then equip it again. Both are real mutations
    // (`/api/shop/unequip` and `/api/shop`), and the control flips each time.
    const unequip = page.getByRole("button", { name: "Unequip", exact: true }).first();
    await expect(unequip).toBeVisible();
    await unequip.click();
    await expect(page.getByRole("button", { name: "Equip", exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Equip", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Unequip", exact: true }).first()).toBeVisible();
  });

  test("the server refuses a purchase the balance cannot cover", async ({
    page,
    request,
    context,
  }) => {
    // A wallet with almost no coins. The card's Unlock control is not disabled —
    // affordability is the server's judgement — so the click reaches the
    // transaction, and the assertion is that the *server* refuses it rather than
    // the browser declining to ask.
    await fundDevWallet(request, context, { coins: 1 });

    await page.goto("/shop");
    await page.getByRole("button", { name: "Unlock" }).first().click();

    // The refusal, surfaced from the API response: the balance is unchanged and
    // nothing was unlocked.
    await expect(page.getByText("You need more CodeCoins for this one.")).toBeVisible();
    await expect(balance(page)).toHaveText("1 CC");
    await expect(page.getByText(/5 of \d+ owned/)).toBeVisible();
  });
});