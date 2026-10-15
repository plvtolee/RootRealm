import { expect, test } from "@playwright/test";

test.describe("RootRealm landing page", () => {
  test("explains the product and navigates to the public profile preview", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: /build your skills/i }),
    ).toBeVisible();

    const primaryAction = page.getByRole("link", { name: "Enter the Realm" }).first();
    await expect(primaryAction).toHaveAttribute("href", "/preview");

    await page.getByRole("link", { name: "Explore the System" }).click();
    await expect(page.locator("#progression")).toBeInViewport();

    await page.getByRole("link", { name: "Character", exact: true }).click();
    await expect(page.locator("#character")).toBeInViewport();

    await primaryAction.click();
    await expect(page).toHaveURL(/\/preview$/);
  });

  test("mobile navigation opens, follows an anchor, and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const menuButton = page.getByRole("button", { name: "Open navigation" });
    await menuButton.click();

    const mobileNavigation = page.getByRole("navigation", {
      name: "Mobile landing page navigation",
    });
    await expect(mobileNavigation).toBeVisible();
    await mobileNavigation.getByRole("link", { name: "Rewards" }).click();

    await expect(page).toHaveURL(/#rewards$/);
    await expect(page.locator("#rewards")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
